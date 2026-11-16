import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { manualEntries, type ManualKey } from '@/lib/question-types';
import { friendlyError, supabase } from '@/lib/supabase';
import type { Answer, Question, Team } from '@/lib/types';

type Props = {
  question: Question;
  answerKey: unknown;
  teams: Team[];
  answers: Answer[];
  /** Show the key above the answers (hidden after reveal, when it is shown elsewhere). */
  showKey?: boolean;
};

/**
 * The quizmaster grades free text and list answers: tap an entry to accept or
 * reject it. Entries matching the key start out accepted (suggested by the
 * database in close_answers). Changes are saved right away via grade_answer.
 */
export function GradingPanel({ question, answerKey, teams, answers, showKey = true }: Props) {
  const [error, setError] = useState<string | null>(null);
  const keyAnswers = (answerKey as ManualKey | null)?.answers ?? [];

  async function toggle(answer: Answer, index: number) {
    const current = answer.grading ?? manualEntries(question, answer.payload).map(() => false);
    const next = current.map((accepted, i) => (i === index ? !accepted : accepted));
    setError(null);
    const { error } = await supabase.rpc('grade_answer', { p_answer_id: answer.id, p_grading: next });
    if (error) setError(friendlyError(error));
    // The new grading arrives through the realtime subscription on `answers`.
  }

  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        RÄTTNING · TRYCK PÅ ETT SVAR FÖR ATT GODKÄNNA ELLER UNDERKÄNNA
      </ThemedText>
      {showKey && keyAnswers.length > 0 && (
        <ThemedText themeColor="textSecondary">Facit: {keyAnswers.join(', ')}</ThemedText>
      )}
      <ErrorText>{error}</ErrorText>

      {teams.map((team) => {
        const answer = answers.find((a) => a.team_id === team.id);
        const entries = answer ? manualEntries(question, answer.payload) : [];
        return (
          <View key={team.id} style={styles.team}>
            <View style={styles.teamHeader}>
              <View style={[styles.dot, { backgroundColor: team.color }]} />
              <ThemedText style={{ flex: 1, fontWeight: 700 }}>{team.name}</ThemedText>
              {answer && (
                <ThemedText type="smallBold">
                  {answer.points ?? 0} p
                </ThemedText>
              )}
            </View>
            {!answer && <ThemedText themeColor="textSecondary">Inget svar</ThemedText>}
            <View style={styles.entries}>
              {entries.map((text, i) => (
                <EntryChip
                  key={i}
                  text={text}
                  accepted={answer?.grading?.[i] ?? false}
                  onPress={() => answer && toggle(answer, i)}
                />
              ))}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function EntryChip({ text, accepted, onPress }: { text: string; accepted: boolean; onPress: () => void }) {
  const theme = useTheme();
  const empty = !text.trim();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: accepted, disabled: empty }}
      disabled={empty}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: accepted ? theme.success : theme.border, backgroundColor: theme.background },
        accepted && { borderWidth: 2 },
      ]}>
      <ThemedText style={{ color: accepted ? theme.success : theme.danger, fontWeight: 800 }}>
        {accepted ? '✓' : '✗'}
      </ThemedText>
      <ThemedText themeColor={empty ? 'textSecondary' : 'text'}>{empty ? '(tomt)' : text}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  team: { gap: Spacing.two, paddingVertical: Spacing.two },
  teamHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 16, height: 16, borderRadius: 8 },
  entries: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
