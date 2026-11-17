import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { AnswerInput } from '@/components/answer-input';
import { Countdown, useSecondsLeft } from '@/components/countdown';
import { QuestionBody } from '@/components/question-body';
import { Scoreboard } from '@/components/scoreboard';
import { TeamList } from '@/components/team-list';
import { TeamMarker } from '@/components/team-marker';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAnswers, useCurrentQuestion, useScoreboard } from '@/hooks/use-game';
import { useSessionLive } from '@/hooks/use-session-live';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { resultText, type AnswerPayload } from '@/lib/question-types';
import { friendlyError, supabase } from '@/lib/supabase';
import type { GameSession, Question, Team } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

/** The team's view: lobby → answer questions → see results → final scoreboard. */
export default function PlayScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { session: auth } = useAuth();
  const t = useT();
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
        <ThemedText type="subtitle">{t.play.notInQuiz}</ThemedText>
        <ErrorText>{error}</ErrorText>
        <Button title={t.play.toStart} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TeamBadge team={myTeam} />

      {session.status === 'lobby' && (
        <>
          <ThemedText>{t.play.waitingForStart}</ThemedText>
          <TeamList teams={teams} />
          <Button title={t.play.leave} variant="danger" onPress={leave} />
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
      <TeamMarker color={team.color} />
      <ThemedText type="smallBold">{team.name}</ThemedText>
    </View>
  );
}

function PlayingView({ session, team, teamCount }: { session: GameSession; team: Team; teamCount: number }) {
  const t = useT();
  const { question, answerKey } = useCurrentQuestion(session);
  const scores = useScoreboard(
    session.id,
    `${session.current_position}-${session.phase}-${teamCount}-${session.scores_version}`,
  );

  if (!question) return <Loading />;

  return (
    <>
      <ThemedText type="label">
        {t.common.questionOf(session.question_index, session.question_count)}
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
  const t = useT();
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
          <ThemedText style={[styles.center, { color: theme.success, fontWeight: 800 }]}>{t.play.locked}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {session.phase === 'locked' ? t.play.grading : t.play.waitingForReveal}
          </ThemedText>
        </Card>
      )}

      {!revealed && !myAnswer && timeUp && question.type !== 'list_timed' && (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {t.play.missed}
        </ThemedText>
      )}

      {revealed && (
        <ResultBanner {...resultText(t, question, myAnswer?.payload, answerKey, myAnswer?.points ?? null)} />
      )}
    </>
  );
}

function ResultBanner({ text, tone }: ReturnType<typeof resultText>) {
  const theme = useTheme();
  const color = { success: theme.success, danger: theme.danger, neutral: theme.textSecondary }[tone];
  return (
    <Animated.View entering={ZoomIn.springify().damping(9)}>
      <ThemedText display style={[styles.result, { color }]}>
        {text}
      </ThemedText>
    </Animated.View>
  );
}

function FinishedView({ session, team, onLeave }: { session: GameSession; team: Team; onLeave: () => void }) {
  const theme = useTheme();
  const t = useT();
  const scores = useScoreboard(session.id, session.status);
  const mine = scores.find((s) => s.team_id === team.id);
  const place = mine ? scores.findIndex((s) => s.score === mine.score) + 1 : null;
  const won = mine && mine.score > 0 && place === 1;
  const tied = won && scores.filter((s) => s.score === mine.score).length > 1;

  return (
    <>
      <ThemedText type="subtitle" style={styles.center}>
        {t.common.quizOver}
      </ThemedText>
      {place && (
        <Animated.View entering={ZoomIn.springify().damping(10)}>
          <ThemedText
            display
            style={[styles.center, styles.placement, { color: won ? theme.primary : theme.text }]}>
            {mine && mine.score === 0
              ? t.play.noPoints
              : won
                ? tied
                  ? t.play.sharedWin
                  : t.play.won
                : t.play.place(place)}
          </ThemedText>
        </Animated.View>
      )}
      <Scoreboard rows={scores} title={t.common.finalResult} highlightTeamId={team.id} />
      <Button title={t.play.leave} variant="secondary" onPress={onLeave} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  prompt: { fontSize: 26, lineHeight: 34, fontWeight: 700 },
  placement: { fontSize: 24, lineHeight: 32, fontWeight: 800 },
  result: { fontSize: 32, lineHeight: 40, fontWeight: 800, textAlign: 'center' },
});
