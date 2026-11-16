import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeAnswer } from '@/lib/question-types';
import type { Answer, Question, Team } from '@/lib/types';

type Props = {
  team: Team;
  answer: Answer | undefined;
  revealed: boolean;
  timeUp: boolean;
  question: Question;
  /** Bigger text for the TV. */
  large?: boolean;
};

/**
 * One team's line during a question: lock-in status before the reveal, the
 * answer and points after. Never shows the answer itself before the reveal.
 */
export function TeamStatus({ team, answer, revealed, timeUp, question, large }: Props) {
  const theme = useTheme();

  let status: string;
  let color: string = theme.textSecondary;
  if (!revealed) {
    status = answer?.locked_at ? '✓ Låst' : timeUp ? 'Hann inte' : 'Tänker …';
    if (answer?.locked_at) color = theme.success;
  } else if (!answer) {
    status = 'Inget svar';
  } else {
    const right = (answer.points ?? 0) > 0;
    status = `${describeAnswer(question, answer.payload)}  ${right ? `✓ +${answer.points}` : '✗'}`;
    color = right ? theme.success : theme.danger;
  }

  const size = large ? 30 : 20;
  return (
    <View style={styles.row}>
      <View style={[styles.dot, large && styles.dotLarge, { backgroundColor: team.color }]} />
      <ThemedText style={{ flex: 1, fontSize: size, lineHeight: size * 1.3, fontWeight: 600 }}>{team.name}</ThemedText>
      <ThemedText style={{ color, fontWeight: 700, fontSize: large ? 26 : 16, lineHeight: large ? 34 : 22 }}>
        {status}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  dot: { width: 18, height: 18, borderRadius: 9 },
  dotLarge: { width: 28, height: 28, borderRadius: 14 },
});
