import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Countdown, useSecondsLeft } from '@/components/countdown';
import { QuestionBody } from '@/components/question-body';
import { Scoreboard } from '@/components/scoreboard';
import { TeamList } from '@/components/team-list';
import { TeamStatus } from '@/components/team-status';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAnswers, useCurrentQuestion, useScoreboard } from '@/hooks/use-game';
import { useSessionLive } from '@/hooks/use-session-live';
import { useTheme } from '@/hooks/use-theme';
import { isManualType } from '@/lib/question-types';
import { supabase } from '@/lib/supabase';
import type { GameSession, Team } from '@/lib/types';

/**
 * The big screen: a read-only, TV-sized view of a game. It never shows
 * anyone's answer before the reveal, and has no controls – the quizmaster
 * runs the game from their phone.
 */
export default function TvScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { session, teams, loading } = useSessionLive(sessionId);
  const title = useQuizTitle(session?.quiz_id);

  if (loading) return <Loading />;
  if (!session) {
    return (
      <Screen centered>
        <ThemedText type="subtitle">Storskärmen är inte ansluten</ThemedText>
        <ThemedText themeColor="textSecondary">Spelet kan ha avslutats, eller så kopplade quizmastern bort skärmen.</ThemedText>
        <Button title="Anslut med ny kod" onPress={() => router.replace('/tv')} />
      </Screen>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.root}>
      <View style={styles.header}>
        <ThemedText display style={[styles.logo, { color: theme.primary }]}>QUIZARD</ThemedText>
        {title && <ThemedText style={styles.title}>{title}</ThemedText>}
        <View style={{ flex: 1 }} />
        {session.status === 'playing' && (
          <ThemedText display themeColor="textSecondary" style={styles.headerCode}>
            Gå med: {session.join_code}
          </ThemedText>
        )}
      </View>

      {session.status === 'lobby' && <Lobby session={session} teams={teams} wide={wide} />}
      {session.status === 'playing' && <Playing session={session} teams={teams} wide={wide} />}
      {session.status === 'finished' && <Finished session={session} />}
    </ScrollView>
  );
}

function useQuizTitle(quizId: string | undefined) {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!quizId) return;
    supabase
      .from('quizzes')
      .select('title')
      .eq('id', quizId)
      .maybeSingle()
      .then(({ data }) => setTitle(data?.title ?? null));
  }, [quizId]);
  return title;
}

/** Two columns on a wide screen, stacked otherwise. */
function Columns({ wide, left, right }: { wide: boolean; left: ReactNode; right: ReactNode }) {
  return (
    <View style={[styles.columns, wide && { flexDirection: 'row' }]}>
      <View style={[styles.column, wide && { flex: 3 }]}>{left}</View>
      <View style={[styles.column, wide && { flex: 2 }]}>{right}</View>
    </View>
  );
}

function Lobby({ session, teams, wide }: { session: GameSession; teams: Team[]; wide: boolean }) {
  const theme = useTheme();
  const joinAddress = Platform.OS === 'web' ? `${window.location.host}/join` : null;
  return (
    <Columns
      wide={wide}
      left={
        <Card>
          <ThemedText style={styles.lead}>
            Gå med{joinAddress ? ` på ${joinAddress}` : ' i QUIZARD-appen'} med koden
          </ThemedText>
          <ThemedText display style={[styles.joinCode, { color: theme.primary }]}>{session.join_code}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.lead}>
            Väntar på att quizmastern startar …
          </ThemedText>
        </Card>
      }
      right={<TeamList teams={teams} large />}
    />
  );
}

function Playing({ session, teams, wide }: { session: GameSession; teams: Team[]; wide: boolean }) {
  const theme = useTheme();
  const { question, answerKey } = useCurrentQuestion(session);
  const answers = useAnswers(session.id, question?.id);
  const scores = useScoreboard(
    session.id,
    `${session.current_position}-${session.phase}-${teams.length}-${session.scores_version}`,
  );
  const secondsLeft = useSecondsLeft(
    session.phase === 'question' ? session.phase_started_at : null,
    question?.time_limit_s ?? null,
  );

  if (!question) return <Loading />;
  const revealed = session.phase === 'reveal';
  const lockedCount = answers.filter((a) => a.locked_at).length;

  return (
    <Columns
      wide={wide}
      left={
        <>
          <ThemedText display themeColor="textSecondary" style={styles.counter}>
            FRÅGA {session.question_index} AV {session.question_count}
          </ThemedText>
          <ThemedText style={styles.prompt}>{question.prompt}</ThemedText>
          {session.phase === 'question' && <Countdown secondsLeft={secondsLeft} />}
          {session.phase === 'locked' && isManualType(question.type) && (
            <ThemedText style={[styles.lead, { color: theme.primary }]}>Quizmastern rättar …</ThemedText>
          )}
          <QuestionBody large question={question} answerKey={revealed ? answerKey : null} />
        </>
      }
      right={
        <>
          <Card>
            <ThemedText type="label">
              {revealed ? 'RESULTAT' : `LÅSTA SVAR ${lockedCount} / ${teams.length}`}
            </ThemedText>
            {teams.map((team) => (
              <TeamStatus
                key={team.id}
                large
                team={team}
                question={question}
                answer={answers.find((a) => a.team_id === team.id)}
                revealed={revealed}
                timeUp={secondsLeft === 0}
              />
            ))}
          </Card>
          {revealed && <Scoreboard rows={scores} />}
        </>
      }
    />
  );
}

function Finished({ session }: { session: GameSession }) {
  const theme = useTheme();
  const scores = useScoreboard(session.id, `${session.status}-${session.scores_version}`);
  // Nobody wins with zero points.
  const winners = scores.filter((s) => s.score > 0 && s.score === scores[0].score);
  return (
    <View style={{ gap: Spacing.four, alignItems: 'center' }}>
      <ThemedText display style={styles.prompt}>Quizet är slut!</ThemedText>
      {winners.length > 0 && (
        <ThemedText display style={[styles.winner, { color: theme.primary }]}>
          🏆 {winners.map((w) => w.name).join(' & ')}
        </ThemedText>
      )}
      <View style={{ width: '100%', maxWidth: 720 }}>
        <Scoreboard rows={scores} title="SLUTRESULTAT" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: Spacing.five, gap: Spacing.four, minHeight: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  logo: { fontSize: 32, lineHeight: 40, fontWeight: 800, letterSpacing: 4 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: 600 },
  headerCode: { fontSize: 22, lineHeight: 30, fontWeight: 700, letterSpacing: 2 },
  columns: { gap: Spacing.four },
  column: { gap: Spacing.three },
  lead: { fontSize: 26, lineHeight: 34, fontWeight: 600, textAlign: 'center' },
  joinCode: { fontSize: 120, lineHeight: 140, fontWeight: 800, letterSpacing: 16, textAlign: 'center' },
  counter: { fontSize: 22, lineHeight: 30, fontWeight: 700 },
  prompt: { fontSize: 44, lineHeight: 54, fontWeight: 800 },
  winner: { fontSize: 48, lineHeight: 60, fontWeight: 800 },
});
