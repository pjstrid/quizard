import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ChoiceList } from '@/components/choice-list';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseNumber, typeHint, type AnswerPayload, type ChoiceConfig, type NumericConfig } from '@/lib/question-types';
import type { Question } from '@/lib/types';

type Props = {
  question: Question;
  busy: boolean;
  onSubmit: (payload: AnswerPayload) => void;
};

/**
 * The team's input for the current question. Render with `key={question.id}`
 * so the state starts fresh for every question.
 */
export function AnswerInput({ question, busy, onSubmit }: Props) {
  const hint = typeHint(question);
  return (
    <View style={{ gap: Spacing.three }}>
      {hint && <ThemedText themeColor="textSecondary">{hint}</ThemedText>}
      {question.type === 'range' || question.type === 'closest' ? (
        <NumericInput question={question} busy={busy} onSubmit={onSubmit} />
      ) : (
        <ChoiceInput question={question} busy={busy} onSubmit={onSubmit} />
      )}
    </View>
  );
}

function ChoiceInput({ question, busy, onSubmit }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const config = question.config as ChoiceConfig;
  const multi = question.type === 'multi_choice';
  const required = multi ? (config.pick ?? 2) : 1;

  function toggle(index: number) {
    if (!multi) return setSelected([index]);
    setSelected((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : prev.length < required ? [...prev, index] : prev,
    );
  }

  function submit() {
    onSubmit(multi ? { choices: selected } : { choice: selected[0] });
  }

  return (
    <>
      <ChoiceList large options={config.options} selected={selected} onSelect={toggle} />
      <Button
        title={multi && selected.length < required ? `Välj ${required - selected.length} till` : 'Lås in svar'}
        onPress={submit}
        loading={busy}
        disabled={selected.length !== required}
      />
    </>
  );
}

function NumericInput({ question, busy, onSubmit }: Props) {
  const theme = useTheme();
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const unit = (question.config as NumericConfig).unit;
  const isRange = question.type === 'range';

  const lowValue = parseNumber(low);
  const highValue = parseNumber(high);
  const valid = isRange ? lowValue !== null && highValue !== null && lowValue <= highValue : lowValue !== null;

  function submit() {
    if (!valid) return;
    onSubmit(isRange ? { low: lowValue!, high: highValue! } : { value: lowValue! });
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }];

  return (
    <>
      <View style={styles.row}>
        <TextInput
          value={low}
          onChangeText={setLow}
          placeholder={isRange ? 'Från' : 'Ert svar'}
          placeholderTextColor={theme.textSecondary}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel={isRange ? 'Från' : 'Ert svar'}
          style={inputStyle}
        />
        {isRange && (
          <>
            <ThemedText style={styles.dash}>–</ThemedText>
            <TextInput
              value={high}
              onChangeText={setHigh}
              placeholder="Till"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Till"
              onSubmitEditing={submit}
              style={inputStyle}
            />
          </>
        )}
        {unit ? <ThemedText style={styles.unit}>{unit}</ThemedText> : null}
      </View>
      {isRange && lowValue !== null && highValue !== null && lowValue > highValue && (
        <ThemedText style={{ color: theme.danger }}>{'”Från” måste vara mindre än ”Till”.'}</ThemedText>
      )}
      <Button title="Lås in svar" onPress={submit} loading={busy} disabled={!valid} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 60,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    fontSize: 24,
    fontWeight: 700,
  },
  dash: { fontSize: 24, fontWeight: 700 },
  unit: { fontSize: 20, fontWeight: 600 },
});
