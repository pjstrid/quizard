import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Answer, GameSession, Question, ScoreRow } from '@/lib/types';

/**
 * The session's current question and, when the caller may read it, its answer key.
 * RLS decides: the host always gets the key, teams only after reveal.
 */
export function useCurrentQuestion(session: GameSession | null) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [answerKey, setAnswerKey] = useState<Record<string, unknown> | null>(null);

  const quizId = session?.quiz_id;
  const position = session?.current_position;
  const phase = session?.phase;

  useEffect(() => {
    if (!quizId || position == null) return;
    let active = true;

    (async () => {
      const { data: q } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quizId)
        .eq('position', position)
        .maybeSingle();
      if (!active) return;
      setQuestion(q as Question | null);
      if (!q) return;

      const { data: key } = await supabase
        .from('question_keys')
        .select('answer')
        .eq('question_id', q.id)
        .maybeSingle();
      if (active) setAnswerKey((key?.answer as Record<string, unknown>) ?? null);
    })();

    return () => {
      active = false;
    };
    // `phase` is a dependency so teams fetch the key again once it is revealed.
  }, [quizId, position, phase]);

  // Ignore state left over from the previous question while the new one loads.
  const current = question && question.position === position ? question : null;
  return { question: current, answerKey: current ? answerKey : null };
}

/**
 * Live answers for a question. The host gets every team's answer, a team only its own (RLS).
 */
export function useAnswers(sessionId: string | undefined, questionId: string | undefined) {
  const [answers, setAnswers] = useState<Answer[]>([]);

  useEffect(() => {
    if (!sessionId || !questionId) return;
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from('answers')
        .select('*')
        .eq('session_id', sessionId)
        .eq('question_id', questionId);
      if (active && data) setAnswers(data as Answer[]);
    };

    load();
    const channel = supabase
      .channel(`answers:${sessionId}:${questionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'answers', filter: `session_id=eq.${sessionId}` },
        load,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load();
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [sessionId, questionId]);

  return answers.filter((a) => a.question_id === questionId);
}

/**
 * Total points per team. Refetched whenever `refreshKey` changes
 * (e.g. on reveal, next question or when a team joins).
 */
export function useScoreboard(sessionId: string | undefined, refreshKey: string) {
  const [rows, setRows] = useState<ScoreRow[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    supabase.rpc('get_scoreboard', { p_session_id: sessionId }).then(({ data }) => {
      if (active && data) setRows(data as ScoreRow[]);
    });
    return () => {
      active = false;
    };
  }, [sessionId, refreshKey]);

  return rows;
}
