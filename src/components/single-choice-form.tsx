import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError, supabase } from '@/lib/supabase';

const LETTERS = ['A', 'B', 'C', 'D'];
const TIME_LIMITS: (number | null)[] = [null, 15, 30, 60];

/**
 * Minimal form for a single-choice question (3–4 options, one correct).
 * A stepping stone until the full quiz editor (#4).
 */
export function SingleChoiceForm({ quizId, onCreated }: { quizId: string; onCreated: () => void }) {
  const theme = useTheme();
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState<number | null>(null);
  const [timeLimit, setTimeLimit] = useState<number | null>(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Empty option D is allowed (3 options); keep track of where each option ends up.
  const filled = options.map((o, i) => ({ text: o.trim(), index: i })).filter((o) => o.text);
  const correctIndex = filled.findIndex((o) => o.index === correct);
  const valid = prompt.trim().length > 0 && filled.length >= 3 && correctIndex >= 0;

  async function save() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.rpc('create_question', {
      p_quiz_id: quizId,
      p_type: 'single_choice',
      p_prompt: prompt.trim(),
      p_config: { options: filled.map((o) => o.text) },
      p_answer: { correct: correctIndex },
      p_time_limit_s: timeLimit,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setPrompt('');
    setOptions(['', '', '', '']);
    setCorrect(null);
    onCreated();
  }

  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        NY FRÅGA · FLERVAL MED ETT RÄTT SVAR
      </ThemedText>
      <TextField label="Fråga" value={prompt} onChangeText={setPrompt} placeholder="T.ex. Vad heter Norges huvudstad?" maxLength={500} multiline />

      <ThemedText type="smallBold">Alternativ (tryck på bokstaven för rätt svar)</ThemedText>
      {options.map((value, i) => (
        <View key={i} style={styles.optionRow}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: correct === i }}
            accessibilityLabel={`Markera ${LETTERS[i]} som rätt svar`}
            onPress={() => setCorrect(i)}
            style={[
              styles.letter,
              { borderColor: correct === i ? theme.success : theme.border },
              correct === i && { backgroundColor: theme.success },
            ]}>
            <ThemedText style={{ fontWeight: 800, color: correct === i ? theme.onPrimary : theme.text }}>
              {correct === i ? '✓' : LETTERS[i]}
            </ThemedText>
          </Pressable>
          <TextInput
            value={value}
            onChangeText={(text) => setOptions((prev) => prev.map((o, j) => (j === i ? text : o)))}
            placeholder={i === 3 ? 'Valfritt' : `Alternativ ${LETTERS[i]}`}
            placeholderTextColor={theme.textSecondary}
            maxLength={120}
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
            ]}
          />
        </View>
      ))}

      <ThemedText type="smallBold">Tidsgräns</ThemedText>
      <View style={styles.chips}>
        {TIME_LIMITS.map((limit) => {
          const active = timeLimit === limit;
          return (
            <Pressable
              key={String(limit)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => setTimeLimit(limit)}
              style={[
                styles.chip,
                { borderColor: active ? theme.primary : theme.border },
                active && { backgroundColor: theme.primary },
              ]}>
              <ThemedText type="smallBold" style={{ color: active ? theme.onPrimary : theme.text }}>
                {limit ? `${limit} s` : 'Ingen'}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <ErrorText>{error}</ErrorText>
      <Button title="Lägg till fråga" onPress={save} loading={busy} disabled={!valid} />
    </Card>
  );
}

const styles = StyleSheet.create({
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  letter: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: Spacing.three, fontSize: 16 },
  chips: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
