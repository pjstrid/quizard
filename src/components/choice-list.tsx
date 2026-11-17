import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Chamfer } from '@/components/chamfer';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LETTERS } from '@/lib/question-types';

type Props = {
  options: string[];
  /** The option(s) this team picked (or is about to lock in). */
  selected?: number[];
  /** Set after reveal (or for the quiz author) to highlight the right option(s). */
  correct?: number[] | null;
  onSelect?: (index: number) => void;
  disabled?: boolean;
  large?: boolean;
};

export function ChoiceList({ options, selected = [], correct, onSelect, disabled, large }: Props) {
  const theme = useTheme();
  const revealed = !!correct && correct.length > 0;

  return (
    <View style={{ gap: Spacing.two }}>
      {options.map((option, index) => {
        const isSelected = selected.includes(index);
        const isCorrect = revealed && correct.includes(index);
        const isWrongPick = revealed && isSelected && !isCorrect;

        // Light grey options with dark text; green/red fills after the reveal
        // (with ✓/✗ so color is never the only signal); yellow frame = picked.
        const background = isCorrect ? theme.success : isWrongPick ? theme.dangerFill : theme.answer;
        const color = isCorrect ? theme.onSuccess : isWrongPick ? theme.onDanger : theme.onAnswer;
        const dimmed = revealed && !isCorrect && !isSelected;
        const label = `${LETTERS[index]}: ${option}${isCorrect ? ', rätt svar' : ''}${isWrongPick ? ', fel svar' : ''}`;

        return (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: isSelected, disabled: disabled || !onSelect }}
            disabled={disabled || !onSelect}
            onPress={() => onSelect?.(index)}
            style={({ pressed }) => [{ opacity: dimmed ? 0.4 : pressed ? 0.85 : 1 }]}>
            <Chamfer
              style={[styles.option, large && styles.optionLarge]}
              cut={large ? 16 : 12}
              fill={background}
              stroke={isSelected && !revealed ? theme.primary : undefined}
              strokeWidth={4}
              glow={isSelected && !revealed ? 'rgba(255, 210, 0, 0.45)' : undefined}>
              <Chamfer
                style={styles.letter}
                corners="all"
                cut={6}
                fill={isSelected && !revealed ? theme.primary : theme.background}>
                <ThemedText display style={{ color: isSelected && !revealed ? theme.onPrimary : theme.text, fontWeight: 800 }}>
                  {LETTERS[index]}
                </ThemedText>
              </Chamfer>
              <ThemedText style={[styles.text, large && styles.textLarge, { color }]}>{option}</ThemedText>
              {(isCorrect || isWrongPick) && (
                <Animated.View entering={ZoomIn.springify().damping(9)}>
                  <ThemedText style={[styles.mark, { color }]}>{isCorrect ? '✓' : '✗'}</ThemedText>
                </Animated.View>
              )}
            </Chamfer>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three + 4,
    minHeight: 60,
  },
  optionLarge: { minHeight: 76 },
  letter: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: 700 },
  textLarge: { fontSize: 24, lineHeight: 30 },
  mark: { fontSize: 24, lineHeight: 28, fontWeight: 900 },
});
