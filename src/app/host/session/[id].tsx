import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Countdown, useSecondsLeft } from '@/components/countdown';
import { DisplayPairing } from '@/components/display-pairing';
import { GradingPanel } from '@/components/grading-panel';
import { QuestionBody } from '@/components/question-body';
import { Scoreboard } from '@/components/scoreboard';
import { TeamList } from '@/components/team-list';
import { TeamStatus } from '@/components/team-status';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Loading, Screen } from '@/components/ui';
import { useAnswers, useCurrentQuestion, useScoreboard } from '@/hooks/use-game';
import { useSessionLive } from '@/hooks/use-session-live';
import { useTheme } from '@/hooks/use-theme';
import { isManualType } from '@/lib/question-types';
import { friendlyError, supabase } from '@/lib/supabase';
import type { GameSession, Team } from '@/lib/types';

type HostRpc = 'start_quiz' | 'close_answers' | 'reveal_question' | 'next_question' | 'finish_quiz';

/**
 * The quizmaster's game view (the "remote control"): lobby → questions →
 * grading → reveal → final scoreboard. The public view for the TV is /tv/[id].
 */
export default function HostSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, teams, loading, error: loadError } = useSessionLive(id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<HostRpc | null>(null);

  async function run(fn: HostRpc) {
    setError(null);
    setBusy(fn);
    const { error } = await supabase.rpc(fn, { p_session_id: id });
    setBusy(null);
    if (error) setError(friendlyError(error));
  }

  async function cancelSession() {
    await supabase.from('game_sessions').delete().eq('id', id);
    router.back();
  }

  if (loading) return <Loading />;
  if (!session) {
    return (
      <Screen centered>
        <ThemedText type="subtitle">Sessionen finns inte längre</ThemedText>
        <ErrorText>{loadError}</ErrorText>
        <Button title="Tillbaka" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      {session.status === 'lobby' && (
        <>
          <JoinCode code={session.join_code} />
          <TeamList teams={teams} large />
          <DisplayPairing sessionId={session.id} />
          <ErrorText>{error}</ErrorText>
          <Button
            title="Starta quiz"
            onPress={() => run('start_quiz')}
            loading={busy === 'start_quiz'}
            disabled={teams.length === 0}
          />
          <Button title="Avbryt" variant="danger" onPress={cancelSession} />
        </>
      )}

      {session.status === 'playing' && (
        <PlayingView session={session} teams={teams} error={error} busy={busy} run={run} />
      )}

      {session.status === 'finished' && <FinishedView session={session} />}
    </Screen>
  );
}

function JoinCode({ code }: { code: string }) {
  const theme = useTheme();
  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.center}>
        GÅ MED PÅ QUIZARD MED KODEN
      </ThemedText>
      <ThemedText style={[styles.code, { color: theme.primary }]} selectable>
        {code}
      </ThemedText>
    </Card>
  );
}

type PlayingProps = {
  session: GameSession;
  teams: Team[];
  error: string | null;
  busy: HostRpc | null;
  run: (fn: HostRpc) => void;
};

function PlayingView({ session, teams, error, busy, run }: PlayingProps) {
  const { question, answerKey } = useCurrentQuestion(session);
  const answers = useAnswers(session.id, question?.id);
  // scores_version changes when the host corrects a grading, so totals refetch.
  const scores = useScoreboard(
    session.id,
    `${session.current_position}-${session.phase}-${teams.length}-${session.scores_version}`,
  );
  const secondsLeft = useSecondsLeft(session.phase === 'question' ? session.phase_started_at : null, question?.time_limit_s ?? null);

  const revealed = session.phase === 'reveal';
  const manual = question ? isManualType(question.type) : false;
  const grading = manual && (session.phase === 'locked' || revealed);
  const isLast = session.question_index === session.question_count;
  const lockedCount = answers.filter((a) => a.locked_at).length;
  // The key stays hidden by default in case this phone is mirrored to a TV.
  const [peek, setPeek] = useState(false);

  if (!question) return <Loading />;

  return (
    <>
      <DisplayPairing sessionId={session.id} compact />
      <ThemedText type="smallBold" themeColor="textSecondary">
        FRÅGA {session.question_index} AV {session.question_count}
      </ThemedText>
      <ThemedText style={styles.prompt}>{question.prompt}</ThemedText>
      {session.phase === 'question' && <Countdown secondsLeft={secondsLeft} />}

      <QuestionBody large question={question} answerKey={revealed || peek ? answerKey : null} />
      {!revealed && (
        <Button
          title={peek ? 'Dölj facit' : 'Visa facit (bara för dig)'}
          variant="secondary"
          onPress={() => setPeek((p) => !p)}
        />
      )}

      {grading ? (
        <GradingPanel
          question={question}
          answerKey={answerKey}
          teams={teams}
          answers={answers}
          showKey={!revealed} // after reveal the key is already shown above
        />
      ) : (
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {revealed ? 'RESULTAT' : `LÅSTA SVAR (${lockedCount} AV ${teams.length})`}
          </ThemedText>
          {teams.map((team) => (
            <TeamStatus
              key={team.id}
              team={team}
              answer={answers.find((a) => a.team_id === team.id)}
              revealed={revealed}
              timeUp={secondsLeft === 0}
              question={question}
            />
          ))}
        </Card>
      )}

      {revealed && <Scoreboard rows={scores} />}

      <ErrorText>{error}</ErrorText>
      {revealed ? (
        <Button
          title={isLast ? 'Visa slutresultat' : 'Nästa fråga'}
          onPress={() => run('next_question')}
          loading={busy === 'next_question'}
        />
      ) : manual && session.phase === 'question' ? (
        <Button title="Stäng svaren och rätta" onPress={() => run('close_answers')} loading={busy === 'close_answers'} />
      ) : (
        <Button title="Visa svar" onPress={() => run('reveal_question')} loading={busy === 'reveal_question'} />
      )}
      <Button title="Avsluta quiz" variant="danger" onPress={() => run('finish_quiz')} loading={busy === 'finish_quiz'} />
    </>
  );
}

function FinishedView({ session }: { session: GameSession }) {
  const scores = useScoreboard(session.id, session.status);
  const winners = scores.filter((s) => scores[0] && s.score === scores[0].score);

  return (
    <>
      <ThemedText type="subtitle" style={styles.center}>
        Quizet är slut!
      </ThemedText>
      {winners.length > 0 && (
        <ThemedText style={[styles.center, { fontSize: 22 }]}>
          🏆 {winners.map((w) => w.name).join(' & ')}
        </ThemedText>
      )}
      <Scoreboard rows={scores} title="SLUTRESULTAT" />
      <Button title="Tillbaka till mina quiz" onPress={() => router.dismissTo('/host')} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  code: { fontSize: 64, lineHeight: 76, fontWeight: 800, letterSpacing: 10, textAlign: 'center' },
  prompt: { fontSize: 28, lineHeight: 36, fontWeight: 700 },
});
