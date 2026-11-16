import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

type Props = {
  options: string[];
  /** The option this team picked (or is about to lock in). */
  selected?: number | null;
  /** Set after reveal to highlight the right option. */
  correct?: number | null;
  onSelect?: (index: number) => void;
  disabled?: boolean;
  large?: boolean;
};

export function ChoiceList({ options, selected, correct, onSelect, disabled, large }: Props) {
  const theme = useTheme();
  const revealed = correct !== null && correct !== undefined;

  return (
    <View style={{ gap: Spacing.two }}>
      {options.map((option, index) => {
        const isSelected = selected === index;
        const isCorrect = revealed && correct === index;
        const isWrongPick = revealed && isSelected && !isCorrect;

        const borderColor = isCorrect
          ? theme.success
          : isWrongPick
            ? theme.danger
            : isSelected
              ? theme.primary
              : theme.border;
        const dimmed = revealed && !isCorrect && !isSelected;

        return (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: disabled || !onSelect }}
            disabled={disabled || !onSelect}
            onPress={() => onSelect?.(index)}
            style={[
              styles.option,
              large && styles.optionLarge,
              { borderColor, backgroundColor: theme.backgroundElement, opacity: dimmed ? 0.45 : 1 },
              (isSelected || isCorrect) && { borderWidth: 3 },
            ]}>
            <View style={[styles.letter, { backgroundColor: isCorrect ? theme.success : theme.primary }]}>
              <ThemedText style={{ color: theme.onPrimary, fontWeight: 800 }}>{LETTERS[index]}</ThemedText>
            </View>
            <ThemedText style={[styles.text, large && styles.textLarge]}>{option}</ThemedText>
            {isCorrect && <ThemedText style={{ color: theme.success, fontWeight: 800 }}>✓</ThemedText>}
            {isWrongPick && <ThemedText style={{ color: theme.danger, fontWeight: 800 }}>✗</ThemedText>}
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
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.three,
    minHeight: 60,
  },
  optionLarge: { minHeight: 76 },
  letter: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontSize: 18, lineHeight: 24 },
  textLarge: { fontSize: 24, lineHeight: 30 },
});
