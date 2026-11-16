-- QUIZARD – auto-graded question types (#2): multi_choice, true_false, range, closest.
--
-- Formats (config = questions.config, key = question_keys.answer, payload = answers.payload).
-- Option indexes are 0-based.
--
--   single_choice  config {"options": [3–4]}                key {"correct": 0}        payload {"choice": 0}
--   true_false     config {"options": [2]}                  key {"correct": 1}        payload {"choice": 1}
--   multi_choice   config {"options": [5–8], "pick": 2|3}   key {"correct": [0, 3]}   payload {"choices": [0, 3]}
--   range          config {"unit": "m"?}                    key {"value": 2097}       payload {"low": 2000, "high": 2200}
--   closest        config {"unit": "m"?}                    key {"value": 2097}       payload {"value": 2100}
--
-- Scoring (on reveal, `points` = questions.points):
--   single_choice / true_false  points if the choice is correct
--   multi_choice                2 correct: points only if both are picked (all or nothing)
--                               3 correct: points per correct pick
--   range                       among ranges that contain the answer, the narrowest wins; ties share; none → 0
--   closest                     the smallest distance wins; ties share

-- ---------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------

create function public.validate_options(p_config jsonb, p_min int, p_max int)
returns int language plpgsql immutable set search_path = '' as $$
declare
  v_count int;
begin
  if jsonb_typeof(p_config -> 'options') is distinct from 'array' then
    raise exception 'invalid_options';
  end if;
  v_count := jsonb_array_length(p_config -> 'options');
  if v_count not between p_min and p_max or exists (
    select 1 from jsonb_array_elements(p_config -> 'options') o
    where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '' or char_length(o #>> '{}') > 120
  ) then
    raise exception 'invalid_options';
  end if;
  return v_count;
end;
$$;

-- True when p_value is an array of p_length distinct valid option indexes.
create function public.is_index_set(p_value jsonb, p_options int, p_length int)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_value) = 'array'
     and jsonb_array_length(p_value) = p_length
     and (select bool_and(public.is_index(e, p_options)) from jsonb_array_elements(p_value) e)
     and (select count(distinct e) from jsonb_array_elements(p_value) e) = p_length;
$$;

create function public.is_number(p_value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p_value) = 'number', false);
$$;

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
      -- Teams must know how many to pick, without seeing the key.
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

    else
      raise exception 'unsupported_question_type';
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

    else
      raise exception 'unsupported_question_type';
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- reveal_question – now scores every auto-graded type.
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

    else
      null; -- manual types are graded by the host (#3)
  end case;

  update public.answers
  set graded = true, updated_at = now()
  where session_id = p_session_id and question_id = v_question.id and points is not null;

  update public.game_sessions
  set phase = 'reveal', phase_started_at = now()
  where id = p_session_id
  returning * into v_session;
  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges for the new helpers (the replaced functions keep their grants).
-- ---------------------------------------------------------------------------

revoke execute on function
  public.validate_options(jsonb, int, int),
  public.is_index_set(jsonb, int, int),
  public.is_number(jsonb)
from public, anon;

grant execute on function
  public.validate_options(jsonb, int, int),
  public.is_index_set(jsonb, int, int),
  public.is_number(jsonb)
to authenticated;
