import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AnswerInput } from '@/components/answer-input';
import { Countdown, useSecondsLeft } from '@/components/countdown';
import { QuestionBody } from '@/components/question-body';
import { Scoreboard } from '@/components/scoreboard';
import { TeamList } from '@/components/team-list';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAnswers, useCurrentQuestion, useScoreboard } from '@/hooks/use-game';
import { useSessionLive } from '@/hooks/use-session-live';
import { useTheme } from '@/hooks/use-theme';
import { resultText, type AnswerPayload } from '@/lib/question-types';
import { friendlyError, supabase } from '@/lib/supabase';
import type { GameSession, Question, Team } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

/** The team's view: lobby → answer questions → see results → final scoreboard. */
export default function PlayScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { session: auth } = useAuth();
  const { session, teams, loading, error } = useSessionLive(sessionId);

  const myTeam = teams.find((t) => t.user_id === auth?.user.id);

  async function leave() {
    if (myTeam) await supabase.from('teams').delete().eq('id', myTeam.id);
    router.replace('/');
  }

  if (loading) return <Loading />;

  if (!session || !myTeam) {
    return (
      <Screen centered>
        <ThemedText type="subtitle">Ni är inte med i det här quizet</ThemedText>
        <ErrorText>{error}</ErrorText>
        <Button title="Till start" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TeamBadge team={myTeam} />

      {session.status === 'lobby' && (
        <>
          <ThemedText>Väntar på att quizmastern startar quizet …</ThemedText>
          <TeamList teams={teams} />
          <Button title="Lämna quizet" variant="danger" onPress={leave} />
        </>
      )}

      {session.status === 'playing' && <PlayingView session={session} team={myTeam} teamCount={teams.length} />}

      {session.status === 'finished' && <FinishedView session={session} team={myTeam} onLeave={leave} />}
    </Screen>
  );
}

function TeamBadge({ team }: { team: Team }) {
  return (
    <View style={styles.badge}>
      <View style={[styles.dot, { backgroundColor: team.color }]} />
      <ThemedText type="smallBold">{team.name}</ThemedText>
    </View>
  );
}

function PlayingView({ session, team, teamCount }: { session: GameSession; team: Team; teamCount: number }) {
  const { question, answerKey } = useCurrentQuestion(session);
  const scores = useScoreboard(
    session.id,
    `${session.current_position}-${session.phase}-${teamCount}-${session.scores_version}`,
  );

  if (!question) return <Loading />;

  return (
    <>
      <ThemedText type="smallBold" themeColor="textSecondary">
        FRÅGA {session.question_index} AV {session.question_count}
      </ThemedText>
      <ThemedText style={styles.prompt}>{question.prompt}</ThemedText>
      {/* key: a fresh component (and empty selection) for every question */}
      <AnswerArea key={question.id} session={session} question={question} answerKey={answerKey} />
      {session.phase === 'reveal' && <Scoreboard rows={scores} highlightTeamId={team.id} />}
    </>
  );
}

function AnswerArea({
  session,
  question,
  answerKey,
}: {
  session: GameSession;
  question: Question;
  answerKey: Record<string, unknown> | null;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myAnswer = useAnswers(session.id, question.id)[0]; // RLS: only our own answer
  const revealed = session.phase === 'reveal';
  const secondsLeft = useSecondsLeft(revealed ? null : session.phase_started_at, question.time_limit_s);
  const timeUp = secondsLeft === 0;
  // A list stays mounted when time is up so it can auto-submit what the team wrote.
  const canAnswer = !revealed && !myAnswer && (!timeUp || question.type === 'list_timed');

  async function lockIn(payload: AnswerPayload) {
    setError(null);
    setBusy(true);
    const { error } = await supabase.rpc('submit_answer', { p_session_id: session.id, p_payload: payload });
    setBusy(false);
    if (error) setError(friendlyError(error));
  }

  return (
    <>
      {!revealed && !myAnswer && <Countdown secondsLeft={secondsLeft} />}

      {canAnswer ? (
        <>
          <AnswerInput question={question} busy={busy} onSubmit={lockIn} startedAt={session.phase_started_at} />
          <ErrorText>{error}</ErrorText>
        </>
      ) : (
        <QuestionBody
          large
          question={question}
          payload={myAnswer?.payload}
          answerKey={revealed ? answerKey : null}
          grading={revealed ? myAnswer?.grading : null}
        />
      )}

      {!revealed && myAnswer && (
        <Card>
          <ThemedText style={[styles.center, { color: theme.success, fontWeight: 800 }]}>✓ Svaret är låst!</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {session.phase === 'locked' ? 'Quizmastern rättar …' : 'Väntar på att quizmastern visar svaret …'}
          </ThemedText>
        </Card>
      )}

      {!revealed && !myAnswer && timeUp && question.type !== 'list_timed' && (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          Ni hann inte svara på den här frågan.
        </ThemedText>
      )}

      {revealed && (
        <ResultBanner {...resultText(question, myAnswer?.payload, answerKey, myAnswer?.points ?? null)} />
      )}
    </>
  );
}

function ResultBanner({ text, tone }: ReturnType<typeof resultText>) {
  const theme = useTheme();
  const color = { success: theme.success, danger: theme.danger, neutral: theme.textSecondary }[tone];
  return <ThemedText style={[styles.result, { color }]}>{text}</ThemedText>;
}

function FinishedView({ session, team, onLeave }: { session: GameSession; team: Team; onLeave: () => void }) {
  const scores = useScoreboard(session.id, session.status);
  const mine = scores.find((s) => s.team_id === team.id);
  const place = mine ? scores.findIndex((s) => s.score === mine.score) + 1 : null;

  return (
    <>
      <ThemedText type="subtitle" style={styles.center}>
        Quizet är slut!
      </ThemedText>
      {place && (
        <ThemedText style={[styles.center, { fontSize: 22 }]}>
          {place === 1 ? '🏆 Ni vann!' : `Ni kom på plats ${place}`}
        </ThemedText>
      )}
      <Scoreboard rows={scores} title="SLUTRESULTAT" highlightTeamId={team.id} />
      <Button title="Lämna quizet" variant="secondary" onPress={onLeave} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 14, height: 14, borderRadius: 7 },
  prompt: { fontSize: 26, lineHeight: 34, fontWeight: 700 },
  result: { fontSize: 32, lineHeight: 40, fontWeight: 800, textAlign: 'center' },
});
