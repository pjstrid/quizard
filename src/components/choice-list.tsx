import { Pressable, StyleSheet, View } from 'react-native';

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
        const borderColor = isSelected && !revealed ? theme.primary : background;
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
            style={({ pressed }) => [
              styles.option,
              large && styles.optionLarge,
              { borderColor, backgroundColor: background, opacity: dimmed ? 0.4 : pressed ? 0.85 : 1 },
            ]}>
            <View
              style={[
                styles.letter,
                { backgroundColor: isSelected && !revealed ? theme.primary : theme.background },
              ]}>
              <ThemedText style={{ color: isSelected && !revealed ? theme.onPrimary : theme.text, fontWeight: 800 }}>
                {LETTERS[index]}
              </ThemedText>
            </View>
            <ThemedText style={[styles.text, large && styles.textLarge, { color }]}>{option}</ThemedText>
            {isCorrect && <ThemedText style={[styles.mark, { color }]}>✓</ThemedText>}
            {isWrongPick && <ThemedText style={[styles.mark, { color }]}>✗</ThemedText>}
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
    borderWidth: 4, // constant so selecting doesn't shift the layout
    borderRadius: 16,
    padding: Spacing.three,
    minHeight: 60,
  },
  optionLarge: { minHeight: 76 },
  letter: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: 700 },
  textLarge: { fontSize: 24, lineHeight: 30 },
  mark: { fontSize: 24, lineHeight: 28, fontWeight: 900 },
});
