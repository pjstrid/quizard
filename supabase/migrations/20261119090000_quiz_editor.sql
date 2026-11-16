-- QUIZARD – quiz editor (#4): edit, reorder and delete questions.
--
-- All question writes now go through SECURITY DEFINER functions with explicit
-- owner checks. That lets them refuse changes while the quiz is being played
-- (positions, options and keys must not shift under a running game), and keeps
-- positions compact (1..n) after a delete.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.quiz_in_play(p_quiz_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.game_sessions where quiz_id = p_quiz_id and status = 'playing');
$$;

-- Raises unless the caller owns the quiz and no game with it is running.
create function public.assert_quiz_editable(p_quiz_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_quiz_owner(p_quiz_id) then
    raise exception 'not_quiz_owner';
  end if;
  if public.quiz_in_play(p_quiz_id) then
    raise exception 'quiz_in_play';
  end if;
end;
$$;

create function public.validate_question_settings(p_type public.question_type, p_time_limit_s int)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_type = 'list_timed' and p_time_limit_s is null then
    raise exception 'time_limit_required';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_question – now SECURITY DEFINER with the editable check.
-- ---------------------------------------------------------------------------

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
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_question public.questions;
begin
  perform public.assert_quiz_editable(p_quiz_id);
  perform public.validate_question(p_type, p_config, p_answer);
  perform public.validate_question_settings(p_type, p_time_limit_s);

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
-- update_question – replaces a question's content and key (type may change).
-- ---------------------------------------------------------------------------

create function public.update_question(
  p_question_id uuid,
  p_type public.question_type,
  p_prompt text,
  p_config jsonb,
  p_answer jsonb,
  p_time_limit_s int default null,
  p_points int default 1
)
returns public.questions
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_question public.questions;
begin
  select * into v_question from public.questions where id = p_question_id;
  if not found then
    raise exception 'not_quiz_owner'; -- don't reveal whether it exists
  end if;
  perform public.assert_quiz_editable(v_question.quiz_id);
  perform public.validate_question(p_type, p_config, p_answer);
  perform public.validate_question_settings(p_type, p_time_limit_s);

  update public.questions
  set type = p_type,
      prompt = btrim(p_prompt),
      config = p_config,
      time_limit_s = p_time_limit_s,
      points = coalesce(p_points, 1)
  where id = p_question_id
  returning * into v_question;

  insert into public.question_keys (question_id, answer) values (p_question_id, p_answer)
  on conflict (question_id) do update set answer = excluded.answer;
  return v_question;
end;
$$;

-- ---------------------------------------------------------------------------
-- move_question – swaps a question with its neighbour (p_offset -1 = up, 1 = down).
-- The unique (quiz_id, position) constraint is deferred, so the swap is allowed.
-- ---------------------------------------------------------------------------

create function public.move_question(p_question_id uuid, p_offset int)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_question public.questions;
  v_neighbour public.questions;
begin
  select * into v_question from public.questions where id = p_question_id;
  if not found then
    raise exception 'not_quiz_owner';
  end if;
  perform public.assert_quiz_editable(v_question.quiz_id);

  if p_offset < 0 then
    select * into v_neighbour from public.questions
    where quiz_id = v_question.quiz_id and position < v_question.position
    order by position desc limit 1;
  else
    select * into v_neighbour from public.questions
    where quiz_id = v_question.quiz_id and position > v_question.position
    order by position limit 1;
  end if;
  if v_neighbour.id is null then
    return; -- already first/last
  end if;

  update public.questions
  set position = case when id = v_question.id then v_neighbour.position else v_question.position end
  where id in (v_question.id, v_neighbour.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_question – deletes and renumbers the rest to 1..n.
-- ---------------------------------------------------------------------------

create function public.delete_question(p_question_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_quiz_id uuid;
begin
  select quiz_id into v_quiz_id from public.questions where id = p_question_id;
  if v_quiz_id is null then
    raise exception 'not_quiz_owner';
  end if;
  perform public.assert_quiz_editable(v_quiz_id);

  delete from public.questions where id = p_question_id;

  update public.questions q
  set position = r.rn
  from (
    select id, row_number() over (order by position)::int as rn
    from public.questions where quiz_id = v_quiz_id
  ) r
  where q.id = r.id and q.position <> r.rn;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: question writes only through the functions above.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.questions, public.question_keys from authenticated;

revoke execute on function
  public.quiz_in_play(uuid),
  public.assert_quiz_editable(uuid),
  public.validate_question_settings(public.question_type, int),
  public.update_question(uuid, public.question_type, text, jsonb, jsonb, int, int),
  public.move_question(uuid, int),
  public.delete_question(uuid)
from public, anon;

grant execute on function
  public.update_question(uuid, public.question_type, text, jsonb, jsonb, int, int),
  public.move_question(uuid, int),
  public.delete_question(uuid)
to authenticated;
-- quiz_in_play, assert_quiz_editable and validate_question_settings are internal.
