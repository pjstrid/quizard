-- QUIZARD – manually graded question types (#3): free_text and list_timed.
--
-- Formats (config = questions.config, key = question_keys.answer, payload = answers.payload):
--
--   free_text   config {"fields": 1–4}   key {"answers": ["Oslo", ...]}   payload {"answers": ["oslo", ""]}
--   list_timed  config {}                key {"answers": ["Skåne", ...]}  payload {"items": ["Skåne", "Uppland"]}
--               (list_timed requires questions.time_limit_s)
--
-- The key's answers are optional and used to *suggest* a grading: entries that
-- match the key (case-insensitive, trimmed, each counted once) start out
-- accepted. The quizmaster has the final say via grade_answer().
--
-- Flow for manual types:
--   question --close_answers()--> locked (QM grades) --reveal_question()--> reveal
-- answers.grading holds one boolean per field/item; points = accepted × questions.points.

alter table public.answers add column grading jsonb;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_string_array(p_value jsonb, p_min int, p_max int, p_max_chars int, p_allow_empty boolean)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p_value) = 'array', false)
     and jsonb_array_length(p_value) between p_min and p_max
     and not exists (
       select 1 from jsonb_array_elements(p_value) e
       where jsonb_typeof(e) <> 'string'
          or char_length(e #>> '{}') > p_max_chars
          or (not p_allow_empty and btrim(e #>> '{}') = '')
     );
$$;

create function public.count_true(p_value jsonb)
returns int language sql immutable set search_path = '' as $$
  select count(*)::int from jsonb_array_elements(coalesce(p_value, '[]'::jsonb)) e where e = 'true'::jsonb;
$$;

-- The submitted entries of a manual answer: free_text → answers, list_timed → items.
create function public.manual_entries(p_type public.question_type, p_payload jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_type when 'free_text' then p_payload -> 'answers' else p_payload -> 'items' end;
$$;

-- Suggested grading: accept entries that match the key, each key value at most once.
create function public.suggest_grading(p_type public.question_type, p_payload jsonb, p_key jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_keys   text[] := array(
    select lower(btrim(e)) from jsonb_array_elements_text(coalesce(p_key -> 'answers', '[]'::jsonb)) e
  );
  v_seen   text[] := '{}';
  v_result jsonb := '[]'::jsonb;
  v_entry  text;
  v_norm   text;
begin
  for v_entry in select e from jsonb_array_elements_text(public.manual_entries(p_type, p_payload)) e loop
    v_norm := lower(btrim(v_entry));
    if v_norm <> '' and v_norm = any (v_keys) and not (v_norm = any (v_seen)) then
      v_result := v_result || 'true'::jsonb;
      v_seen := v_seen || v_norm;
    else
      v_result := v_result || 'false'::jsonb;
    end if;
  end loop;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Validation (replaces the versions from 20261117090000, adds manual types)
-- ---------------------------------------------------------------------------

create or replace function public.validate_question(p_type public.question_type, p_config jsonb, p_answer jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  v_count int;
begin
  case p_type
    when 'single_choice', 'true_false' then
      v_count := case p_type when 'single_choice' then public.validate_options(p_config, 3, 4)
                             else public.validate_options(p_config, 2, 2) end;
      if not coalesce(public.is_index(p_answer -> 'correct', v_count), false) then
        raise exception 'invalid_answer_key';
      end if;

    when 'multi_choice' then
      v_count := public.validate_options(p_config, 5, 8);
      if jsonb_typeof(p_answer -> 'correct') is distinct from 'array'
         or jsonb_array_length(p_answer -> 'correct') not between 2 and 3
         or not coalesce(public.is_index_set(p_answer -> 'correct', v_count, jsonb_array_length(p_answer -> 'correct')), false) then
        raise exception 'invalid_answer_key';
      end if;
      if not public.is_number(p_config -> 'pick')
         or (p_config ->> 'pick') <> jsonb_array_length(p_answer -> 'correct')::text then
        raise exception 'invalid_pick';
      end if;

    when 'range', 'closest' then
      if not public.is_number(p_answer -> 'value') then
        raise exception 'invalid_answer_key';
      end if;
      if p_config ? 'unit' and (jsonb_typeof(p_config -> 'unit') <> 'string' or char_length(p_config ->> 'unit') > 20) then
        raise exception 'invalid_unit';
      end if;

    when 'free_text' then
      if not coalesce(public.is_index(p_config -> 'fields', 5), false) or (p_config ->> 'fields')::int < 1 then
        raise exception 'invalid_fields';
      end if;
      if not public.is_string_array(p_answer -> 'answers', 0, 50, 120, false) then
        raise exception 'invalid_answer_key';
      end if;

    when 'list_timed' then
      if not public.is_string_array(p_answer -> 'answers', 0, 300, 80, false) then
        raise exception 'invalid_answer_key';
      end if;
  end case;
end;
$$;

create or replace function public.validate_answer(p_type public.question_type, p_config jsonb, p_payload jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  case p_type
    when 'single_choice', 'true_false' then
      if not coalesce(public.is_index(p_payload -> 'choice', jsonb_array_length(p_config -> 'options')), false) then
        raise exception 'invalid_answer';
      end if;

    when 'multi_choice' then
      if not coalesce(public.is_index_set(
        p_payload -> 'choices', jsonb_array_length(p_config -> 'options'), (p_config ->> 'pick')::int
      ), false) then
        raise exception 'invalid_answer';
      end if;

    when 'range' then
      if not (public.is_number(p_payload -> 'low') and public.is_number(p_payload -> 'high'))
         or (p_payload ->> 'low')::numeric > (p_payload ->> 'high')::numeric then
        raise exception 'invalid_answer';
      end if;

    when 'closest' then
      if not public.is_number(p_payload -> 'value') then
        raise exception 'invalid_answer';
      end if;

    when 'free_text' then
      -- One string per field; empty fields are allowed (the team left them blank).
      if not public.is_string_array(p_payload -> 'answers', (p_config ->> 'fields')::int, (p_config ->> 'fields')::int, 120, true) then
        raise exception 'invalid_answer';
      end if;

    when 'list_timed' then
      if not public.is_string_array(p_payload -> 'items', 0, 100, 80, false) then
        raise exception 'invalid_answer';
      end if;
  end case;
end;
$$;

-- list_timed needs a time limit; otherwise unchanged from 20261116150000.
create or replace function public.create_question(
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
  if p_type = 'list_timed' and p_time_limit_s is null then
    raise exception 'time_limit_required';
  end if;

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
-- close_answers – stop accepting answers so the host can grade (phase 'locked').
-- Manual answers get a suggested grading from the key.
-- ---------------------------------------------------------------------------

create function public.close_answers(p_session_id uuid)
returns public.game_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session  public.game_sessions := public.lock_session_as_host(p_session_id);
  v_question public.questions;
  v_key      jsonb;
begin
  if v_session.status <> 'playing' or v_session.phase <> 'question' then
    raise exception 'invalid_state';
  end if;

  select * into v_question from public.questions
  where quiz_id = v_session.quiz_id and position = v_session.current_position;
  select answer into v_key from public.question_keys where question_id = v_question.id;

  if v_question.type in ('free_text', 'list_timed') then
    update public.answers
    set grading = public.suggest_grading(v_question.type, payload, v_key),
        updated_at = now()
    where session_id = p_session_id and question_id = v_question.id;

    update public.answers
    set points = public.count_true(grading) * v_question.points
    where session_id = p_session_id and question_id = v_question.id;
  end if;

  update public.game_sessions
  set phase = 'locked', phase_started_at = now()
  where id = p_session_id
  returning * into v_session;
  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- grade_answer – the host accepts/rejects each field or list item.
-- Allowed while grading ('locked') and after reveal, for corrections.
-- ---------------------------------------------------------------------------

create function public.grade_answer(p_answer_id uuid, p_grading jsonb)
returns public.answers
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_answer   public.answers;
  v_session  public.game_sessions;
  v_question public.questions;
begin
  select * into v_answer from public.answers where id = p_answer_id;
  if not found then
    raise exception 'not_session_host';  -- don't reveal whether the answer exists
  end if;
  v_session := public.lock_session_as_host(v_answer.session_id);

  select * into v_question from public.questions where id = v_answer.question_id;
  if v_question.type not in ('free_text', 'list_timed') then
    raise exception 'not_manual_question';
  end if;
  if v_session.status <> 'playing'
     or v_session.phase not in ('locked', 'reveal')
     or v_session.current_position is distinct from v_question.position then
    raise exception 'invalid_state';
  end if;

  if jsonb_typeof(p_grading) is distinct from 'array'
     or jsonb_array_length(p_grading) <> jsonb_array_length(public.manual_entries(v_question.type, v_answer.payload))
     or exists (select 1 from jsonb_array_elements(p_grading) g where jsonb_typeof(g) <> 'boolean') then
    raise exception 'invalid_grading';
  end if;

  update public.answers
  set grading = p_grading,
      points = public.count_true(p_grading) * v_question.points,
      graded = true,
      updated_at = now()
  where id = p_answer_id
  returning * into v_answer;
  return v_answer;
end;
$$;

-- ---------------------------------------------------------------------------
-- reveal_question – also accepts phase 'locked' and finalises manual grading.
-- ---------------------------------------------------------------------------

create or replace function public.reveal_question(p_session_id uuid)
returns public.game_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session  public.game_sessions := public.lock_session_as_host(p_session_id);
  v_question public.questions;
  v_key      jsonb;
  v_correct  int[];
  v_value    numeric;
  v_best     numeric;
begin
  if v_session.status <> 'playing' or v_session.phase not in ('question', 'locked') then
    raise exception 'invalid_state';
  end if;

  select * into v_question from public.questions
  where quiz_id = v_session.quiz_id and position = v_session.current_position;
  select answer into v_key from public.question_keys where question_id = v_question.id;

  -- Teams without an answer simply have no row (0 points).
  case v_question.type
    when 'single_choice', 'true_false' then
      update public.answers
      set points = case when (payload ->> 'choice')::int = (v_key ->> 'correct')::int
                        then v_question.points else 0 end
      where session_id = p_session_id and question_id = v_question.id;

    when 'multi_choice' then
      v_correct := array(select e::int from jsonb_array_elements_text(v_key -> 'correct') e);
      update public.answers a
      set points = (
        select case
                 when cardinality(v_correct) <= 2 then
                   case when count(*) filter (where c::int = any (v_correct)) = cardinality(v_correct)
                        then v_question.points else 0 end
                 else (count(*) filter (where c::int = any (v_correct)))::int * v_question.points
               end
        from jsonb_array_elements_text(a.payload -> 'choices') c
      )
      where a.session_id = p_session_id and a.question_id = v_question.id;

    when 'range' then
      v_value := (v_key ->> 'value')::numeric;
      select min((payload ->> 'high')::numeric - (payload ->> 'low')::numeric) into v_best
      from public.answers
      where session_id = p_session_id and question_id = v_question.id
        and v_value between (payload ->> 'low')::numeric and (payload ->> 'high')::numeric;

      update public.answers
      set points = case
                     when v_best is not null
                      and v_value between (payload ->> 'low')::numeric and (payload ->> 'high')::numeric
                      and (payload ->> 'high')::numeric - (payload ->> 'low')::numeric = v_best
                     then v_question.points else 0 end
      where session_id = p_session_id and question_id = v_question.id;

    when 'closest' then
      v_value := (v_key ->> 'value')::numeric;
      select min(abs((payload ->> 'value')::numeric - v_value)) into v_best
      from public.answers
      where session_id = p_session_id and question_id = v_question.id;

      update public.answers
      set points = case when abs((payload ->> 'value')::numeric - v_value) = v_best
                        then v_question.points else 0 end
      where session_id = p_session_id and question_id = v_question.id;

    when 'free_text', 'list_timed' then
      -- Revealed straight from 'question' (no grading step): use the suggestion.
      update public.answers
      set grading = public.suggest_grading(v_question.type, payload, v_key)
      where session_id = p_session_id and question_id = v_question.id and grading is null;

      update public.answers
      set points = public.count_true(grading) * v_question.points
      where session_id = p_session_id and question_id = v_question.id;
  end case;

  update public.answers
  set graded = true, updated_at = now()
  where session_id = p_session_id and question_id = v_question.id;

  update public.game_sessions
  set phase = 'reveal', phase_started_at = now()
  where id = p_session_id
  returning * into v_session;
  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_scoreboard – only counts revealed questions, so suggested points for a
-- question being graded don't show up early.
-- ---------------------------------------------------------------------------

create or replace function public.get_scoreboard(p_session_id uuid)
returns table (team_id uuid, name text, color text, score int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_session_host(p_session_id) or public.is_session_team(p_session_id)) then
    raise exception 'not_in_session';
  end if;

  return query
    select t.id, t.name, t.color,
           coalesce(sum(a.points) filter (
             where gs.status = 'finished'
                or q.position < gs.current_position
                or (q.position = gs.current_position and gs.phase = 'reveal')
           ), 0)::int
    from public.teams t
    join public.game_sessions gs on gs.id = t.session_id
    left join public.answers a on a.team_id = t.id
    left join public.questions q on q.id = a.question_id
    where t.session_id = p_session_id
    group by t.id
    order by 4 desc, t.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.is_string_array(jsonb, int, int, int, boolean),
  public.count_true(jsonb),
  public.manual_entries(public.question_type, jsonb),
  public.suggest_grading(public.question_type, jsonb, jsonb),
  public.close_answers(uuid),
  public.grade_answer(uuid, jsonb)
from public, anon;

grant execute on function
  public.is_string_array(jsonb, int, int, int, boolean),
  public.count_true(jsonb),
  public.manual_entries(public.question_type, jsonb),
  public.suggest_grading(public.question_type, jsonb, jsonb),
  public.close_answers(uuid),
  public.grade_answer(uuid, jsonb)
to authenticated;
