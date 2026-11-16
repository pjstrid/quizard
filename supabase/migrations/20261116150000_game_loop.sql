-- QUIZARD – game loop with single-choice questions (#1).
--
-- All game state transitions now go through RPC functions so the server is the
-- single source of truth: the host starts, reveals and advances; teams submit
-- answers; scoring happens in reveal_question().
--
-- Formats (config = questions.config, key = question_keys.answer, payload = answers.payload):
--   single_choice  config {"options": ["A", "B", "C"(, "D")]}  key {"correct": 0}  payload {"choice": 0}
--   (indexes are 0-based)

-- ---------------------------------------------------------------------------
-- Session progress shown to everyone ("question 2 of 5"). Positions can have
-- gaps after a question is deleted, so the index is tracked separately.
-- ---------------------------------------------------------------------------

alter table public.game_sessions
  add column question_index int,
  add column question_count int;

-- The host no longer updates the session directly; use the RPCs below.
revoke update on public.game_sessions from authenticated;
drop policy "host controls session" on public.game_sessions;

-- ---------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------

create function public.is_index(p_value jsonb, p_length int)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_value) = 'number'
     and (p_value #>> '{}') ~ '^\d+$'
     and (p_value #>> '{}')::int < p_length;
$$;

create function public.validate_question(p_type public.question_type, p_config jsonb, p_answer jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  v_count int;
begin
  case p_type
    when 'single_choice' then
      if jsonb_typeof(p_config -> 'options') is distinct from 'array' then
        raise exception 'invalid_options';
      end if;
      v_count := jsonb_array_length(p_config -> 'options');
      if v_count not between 3 and 4 or exists (
        select 1 from jsonb_array_elements(p_config -> 'options') o
        where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = ''
      ) then
        raise exception 'invalid_options';
      end if;
      if not coalesce(public.is_index(p_answer -> 'correct', v_count), false) then
        raise exception 'invalid_answer_key';
      end if;
    else
      raise exception 'unsupported_question_type';
  end case;
end;
$$;

create function public.validate_answer(p_type public.question_type, p_config jsonb, p_payload jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  case p_type
    when 'single_choice' then
      if not coalesce(public.is_index(p_payload -> 'choice', jsonb_array_length(p_config -> 'options')), false) then
        raise exception 'invalid_answer';
      end if;
    else
      raise exception 'unsupported_question_type';
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_question – inserts a question and its answer key in one transaction.
-- SECURITY INVOKER: runs as the caller, so the normal RLS rules apply.
-- ---------------------------------------------------------------------------

create function public.create_question(
  p_quiz_id uuid,
  p_type public.question_type,
  p_prompt text,
  p_config jsonb,
  p_answer jsonb,
  p_time_limit_s int default null,
  p_points int default 1
)
returns public.questions
language plpgsql volatile set search_path = '' as $$
declare
  v_question public.questions;
begin
  if not public.is_quiz_owner(p_quiz_id) then
    raise exception 'not_quiz_owner';
  end if;
  perform public.validate_question(p_type, p_config, p_answer);

  insert into public.questions (quiz_id, position, type, prompt, config, time_limit_s, points)
  values (
    p_quiz_id,
    coalesce((select max(position) from public.questions where quiz_id = p_quiz_id), 0) + 1,
    p_type,
    btrim(p_prompt),
    p_config,
    p_time_limit_s,
    coalesce(p_points, 1)
  )
  returning * into v_question;

  insert into public.question_keys (question_id, answer) values (v_question.id, p_answer);
  return v_question;
end;
$$;

-- ---------------------------------------------------------------------------
-- Host controls. SECURITY DEFINER + explicit host check.
-- `for update` locks the session row so concurrent calls run one at a time.
-- ---------------------------------------------------------------------------

create function public.lock_session_as_host(p_session_id uuid)
returns public.game_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session public.game_sessions;
begin
  select * into v_session from public.game_sessions where id = p_session_id for update;
  if not found or v_session.host_id is distinct from auth.uid() then
    raise exception 'not_session_host';
  end if;
  return v_session;
end;
$$;

create function public.start_quiz(p_session_id uuid)
returns public.game_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session public.game_sessions := public.lock_session_as_host(p_session_id);
  v_first   int;
  v_count   int;
begin
  if v_session.status <> 'lobby' then
    raise exception 'invalid_state';
  end if;

  select min(position), count(*) into v_first, v_count
  from public.questions where quiz_id = v_session.quiz_id;
  if v_count = 0 then
    raise exception 'no_questions';
  end if;

  update public.game_sessions
  set status = 'playing', current_position = v_first, question_index = 1, question_count = v_count,
      phase = 'question', phase_started_at = now()
  where id = p_session_id
  returning * into v_session;
  return v_session;
end;
$$;

create function public.reveal_question(p_session_id uuid)
returns public.game_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session  public.game_sessions := public.lock_session_as_host(p_session_id);
  v_question public.questions;
  v_key      jsonb;
begin
  if v_session.status <> 'playing' or v_session.phase not in ('question', 'locked') then
    raise exception 'invalid_state';
  end if;

  select * into v_question from public.questions
  where quiz_id = v_session.quiz_id and position = v_session.current_position;
  select answer into v_key from public.question_keys where question_id = v_question.id;

  -- Score every submitted answer. Teams without an answer simply get no row (0 points).
  case v_question.type
    when 'single_choice' then
      update public.answers
      set points = case when (payload ->> 'choice')::int = (v_key ->> 'correct')::int
                        then v_question.points else 0 end,
          graded = true,
          updated_at = now()
      where session_id = p_session_id and question_id = v_question.id;
    else
      null; -- other types are graded in later stages (#2, #3)
  end case;

  update public.game_sessions
  set phase = 'reveal', phase_started_at = now()
  where id = p_session_id
  returning * into v_session;
  return v_session;
end;
$$;

-- Moves to the next question, or finishes the quiz after the last one.
create function public.next_question(p_session_id uuid)
returns public.game_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session public.game_sessions := public.lock_session_as_host(p_session_id);
  v_next    int;
begin
  if v_session.status <> 'playing' or v_session.phase <> 'reveal' then
    raise exception 'invalid_state';
  end if;

  select min(position) into v_next from public.questions
  where quiz_id = v_session.quiz_id and position > v_session.current_position;

  if v_next is null then
    update public.game_sessions
    set status = 'finished', phase = null, phase_started_at = now()
    where id = p_session_id
    returning * into v_session;
  else
    update public.game_sessions
    set current_position = v_next, question_index = question_index + 1,
        phase = 'question', phase_started_at = now()
    where id = p_session_id
    returning * into v_session;
  end if;
  return v_session;
end;
$$;

create function public.finish_quiz(p_session_id uuid)
returns public.game_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session public.game_sessions := public.lock_session_as_host(p_session_id);
begin
  update public.game_sessions
  set status = 'finished', phase = null, phase_started_at = now()
  where id = p_session_id
  returning * into v_session;
  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_answer – a team locks in its answer to the current question.
-- One submission per question; it is locked immediately.
-- ---------------------------------------------------------------------------

create function public.submit_answer(p_session_id uuid, p_payload jsonb)
returns public.answers
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_team_id  uuid;
  v_session  public.game_sessions;
  v_question public.questions;
  v_answer   public.answers;
begin
  select id into v_team_id from public.teams
  where session_id = p_session_id and user_id = auth.uid();
  if v_team_id is null then
    raise exception 'not_in_session';
  end if;

  -- `for share` waits for a running reveal_question(), so no answer slips in after scoring.
  select * into v_session from public.game_sessions where id = p_session_id for share;
  if v_session.status <> 'playing' or v_session.phase is distinct from 'question' then
    raise exception 'answers_closed';
  end if;

  select * into v_question from public.questions
  where quiz_id = v_session.quiz_id and position = v_session.current_position;

  -- A few seconds of grace for network latency.
  if v_question.time_limit_s is not null
     and now() > v_session.phase_started_at + make_interval(secs => v_question.time_limit_s + 3) then
    raise exception 'time_up';
  end if;

  perform public.validate_answer(v_question.type, v_question.config, p_payload);

  insert into public.answers (session_id, question_id, team_id, payload, locked_at)
  values (p_session_id, v_question.id, v_team_id, p_payload, now())
  on conflict (team_id, question_id) do nothing
  returning * into v_answer;

  if v_answer.id is null then
    raise exception 'already_locked';
  end if;
  return v_answer;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_scoreboard – total points per team. Teams cannot read each other's
-- answers (RLS), so the totals are computed here for host and teams alike.
-- ---------------------------------------------------------------------------

create function public.get_scoreboard(p_session_id uuid)
returns table (team_id uuid, name text, color text, score int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_session_host(p_session_id) or public.is_session_team(p_session_id)) then
    raise exception 'not_in_session';
  end if;

  return query
    select t.id, t.name, t.color, coalesce(sum(a.points), 0)::int
    from public.teams t
    left join public.answers a on a.team_id = t.id
    where t.session_id = p_session_id
    group by t.id
    order by 4 desc, t.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.is_index(jsonb, int),
  public.validate_question(public.question_type, jsonb, jsonb),
  public.validate_answer(public.question_type, jsonb, jsonb),
  public.create_question(uuid, public.question_type, text, jsonb, jsonb, int, int),
  public.lock_session_as_host(uuid),
  public.start_quiz(uuid),
  public.reveal_question(uuid),
  public.next_question(uuid),
  public.finish_quiz(uuid),
  public.submit_answer(uuid, jsonb),
  public.get_scoreboard(uuid)
from public, anon;

grant execute on function
  public.is_index(jsonb, int),
  public.validate_question(public.question_type, jsonb, jsonb),
  public.validate_answer(public.question_type, jsonb, jsonb),
  public.create_question(uuid, public.question_type, text, jsonb, jsonb, int, int),
  public.start_quiz(uuid),
  public.reveal_question(uuid),
  public.next_question(uuid),
  public.finish_quiz(uuid),
  public.submit_answer(uuid, jsonb),
  public.get_scoreboard(uuid)
to authenticated;
-- lock_session_as_host() is internal: only called from the definer functions above.
