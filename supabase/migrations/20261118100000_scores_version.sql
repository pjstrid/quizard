-- QUIZARD – refresh scoreboards after grading corrections.
--
-- Bug: when the host corrected a grading after the reveal, the teams'
-- scoreboards stayed stale. Teams only receive realtime events for their own
-- answers (RLS), so they never heard about other teams' new points.
-- grade_answer() now bumps game_sessions.scores_version, which every client
-- in the session receives and uses to refetch the scoreboard.

alter table public.game_sessions add column scores_version int not null default 0;

create or replace function public.grade_answer(p_answer_id uuid, p_grading jsonb)
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

  -- Tell every client that totals changed (teams can't see other teams' answers).
  update public.game_sessions set scores_version = scores_version + 1 where id = v_session.id;
  return v_answer;
end;
$$;
