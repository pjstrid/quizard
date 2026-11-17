import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Countdown, useSecondsLeft } from '@/components/countdown';
import { JoinQr } from '@/components/join-qr';
import { QuestionBody } from '@/components/question-body';
import { Scoreboard } from '@/components/scoreboard';
import { TeamList } from '@/components/team-list';
import { TeamStatus } from '@/components/team-status';
import { TvCanvas } from '@/components/tv-canvas';
import { WinnerBanner } from '@/components/winner-banner';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAnswers, useCurrentQuestion, useScoreboard } from '@/hooks/use-game';
import { useSessionLive } from '@/hooks/use-session-live';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
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
  const t = useT();
  const { session, teams, loading } = useSessionLive(sessionId);
  const title = useQuizTitle(session?.quiz_id);

  if (loading) return <Loading />;
  if (!session) {
    return (
      <Screen centered>
        <ThemedText type="subtitle">{t.tv.notConnected}</ThemedText>
        <ThemedText themeColor="textSecondary">{t.tv.notConnectedHint}</ThemedText>
        <Button title={t.tv.reconnect} onPress={() => router.replace('/tv')} />
      </Screen>
    );
  }

  return (
    <TvCanvas>
      {(width) => (
        <View style={styles.root}>
          <View style={styles.header}>
            <ThemedText display style={[styles.logo, { color: theme.primary }]}>QUIZARD</ThemedText>
            {title && <ThemedText style={styles.title}>{title}</ThemedText>}
            <View style={{ flex: 1 }} />
            {session.status === 'playing' && (
              <ThemedText display themeColor="textSecondary" style={styles.headerCode}>
                {t.tv.joinHeader(session.join_code)}
              </ThemedText>
            )}
          </View>

          {session.status === 'lobby' && <Lobby session={session} teams={teams} wide={width >= 900} />}
          {session.status === 'playing' && <Playing session={session} teams={teams} wide={width >= 900} />}
          {session.status === 'finished' && <Finished session={session} />}
        </View>
      )}
    </TvCanvas>
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
  const t = useT();
  const joinAddress = Platform.OS === 'web' ? `${window.location.host}/join` : null;
  return (
    <Columns
      wide={wide}
      left={
        <Card highlight>
          <ThemedText style={styles.lead}>
            {t.tv.joinAt(joinAddress)}
          </ThemedText>
          <ThemedText display style={[styles.joinCode, { color: theme.primary }]} numberOfLines={1}>
            {session.join_code}
          </ThemedText>
          <View style={styles.joinRow}>
            <JoinQr code={session.join_code} size={wide ? 200 : 170} />
            <View style={{ flex: 1, minWidth: 180, gap: Spacing.two }}>
              <ThemedText type="label">{t.tv.orScan}</ThemedText>
              <ThemedText style={styles.qrHint}>{t.tv.scanHint}</ThemedText>
            </View>
          </View>
          <ThemedText themeColor="textSecondary" style={styles.lead}>
            {t.tv.waiting}
          </ThemedText>
        </Card>
      }
      right={<TeamList teams={teams} large />}
    />
  );
}

function Playing({ session, teams, wide }: { session: GameSession; teams: Team[]; wide: boolean }) {
  const theme = useTheme();
  const t = useT();
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
        // Each new question slides in on the big screen (#6).
        <Animated.View key={question.id} entering={FadeInDown.springify().damping(16)} style={styles.column}>
          <ThemedText display themeColor="textSecondary" style={styles.counter}>
            {t.common.questionOf(session.question_index, session.question_count)}
          </ThemedText>
          <ThemedText style={styles.prompt}>{question.prompt}</ThemedText>
          {session.phase === 'question' && <Countdown secondsLeft={secondsLeft} />}
          {session.phase === 'locked' && isManualType(question.type) && (
            <ThemedText style={[styles.lead, { color: theme.primary }]}>{t.tv.grading}</ThemedText>
          )}
          <QuestionBody large question={question} answerKey={revealed ? answerKey : null} />
        </Animated.View>
      }
      right={
        <>
          <Card>
            <ThemedText type="label">
              {revealed ? t.common.results : t.tv.lockedAnswers(lockedCount, teams.length)}
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
  const t = useT();
  const scores = useScoreboard(session.id, `${session.status}-${session.scores_version}`);
  // Nobody wins with zero points.
  const winners = scores.filter((s) => s.score > 0 && s.score === scores[0].score);
  return (
    <View style={{ gap: Spacing.four, alignItems: 'center' }}>
      <ThemedText display style={styles.prompt}>{t.common.quizOver}</ThemedText>
      {winners.length > 0 && <WinnerBanner large names={winners.map((w) => w.name)} />}
      <View style={{ width: '100%', maxWidth: 720 }}>
        <Scoreboard rows={scores} title={t.common.finalResult} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: Spacing.five, gap: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  logo: { fontSize: 32, lineHeight: 40, fontWeight: 800, letterSpacing: 4 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: 600 },
  headerCode: { fontSize: 22, lineHeight: 30, fontWeight: 700, letterSpacing: 2 },
  columns: { gap: Spacing.four },
  column: { gap: Spacing.three },
  joinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four, alignItems: 'center', justifyContent: 'center' },
  qrHint: { fontSize: 22, lineHeight: 30, fontWeight: 600 },
  lead: { fontSize: 26, lineHeight: 34, fontWeight: 600, textAlign: 'center' },
  joinCode: { fontSize: 96, lineHeight: 116, fontWeight: 800, letterSpacing: 10, textAlign: 'center' },
  counter: { fontSize: 22, lineHeight: 30, fontWeight: 700 },
  prompt: { fontSize: 44, lineHeight: 54, fontWeight: 800 },
});
