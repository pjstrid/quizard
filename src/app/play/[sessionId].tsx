import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceList } from '@/components/choice-list';
import { Countdown, useSecondsLeft } from '@/components/countdown';
import { Scoreboard } from '@/components/scoreboard';
import { TeamList } from '@/components/team-list';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAnswers, useCurrentQuestion, useScoreboard } from '@/hooks/use-game';
import { useSessionLive } from '@/hooks/use-session-live';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError, supabase } from '@/lib/supabase';
import type { GameSession, Question, SingleChoiceConfig, SingleChoiceKey, Team } from '@/lib/types';
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
  const scores = useScoreboard(session.id, `${session.current_position}-${session.phase}-${teamCount}`);

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
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myAnswer = useAnswers(session.id, question.id)[0]; // RLS: only our own answer
  const lockedChoice = (myAnswer?.payload as { choice?: number } | undefined)?.choice ?? null;
  const revealed = session.phase === 'reveal';
  const secondsLeft = useSecondsLeft(revealed ? null : session.phase_started_at, question.time_limit_s);
  const timeUp = secondsLeft === 0;
  const canAnswer = !revealed && !myAnswer && !timeUp;

  async function lockIn() {
    if (selected === null) return;
    setError(null);
    setBusy(true);
    const { error } = await supabase.rpc('submit_answer', {
      p_session_id: session.id,
      p_payload: { choice: selected },
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
  }

  const options = (question.config as SingleChoiceConfig).options;
  const correct = revealed ? ((answerKey as SingleChoiceKey | null)?.correct ?? null) : null;

  return (
    <>
      {!revealed && !myAnswer && <Countdown secondsLeft={secondsLeft} />}

      <ChoiceList
        large
        options={options}
        selected={myAnswer ? lockedChoice : selected}
        correct={correct}
        onSelect={canAnswer ? setSelected : undefined}
      />

      {canAnswer && (
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="Lås in svar" onPress={lockIn} loading={busy} disabled={selected === null} />
        </>
      )}

      {!revealed && myAnswer && (
        <Card>
          <ThemedText style={[styles.center, { color: theme.success, fontWeight: 800 }]}>✓ Svaret är låst!</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Väntar på att quizmastern visar svaret …
          </ThemedText>
        </Card>
      )}

      {!revealed && !myAnswer && timeUp && (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          Ni hann inte svara på den här frågan.
        </ThemedText>
      )}

      {revealed && <ResultBanner points={myAnswer?.points ?? null} answered={!!myAnswer} />}
    </>
  );
}

function ResultBanner({ points, answered }: { points: number | null; answered: boolean }) {
  const theme = useTheme();
  const right = (points ?? 0) > 0;
  const text = !answered ? 'Inget svar' : right ? `Rätt! +${points}` : 'Fel svar';
  const color = !answered ? theme.textSecondary : right ? theme.success : theme.danger;
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
