import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chamfer } from '@/components/chamfer';
import { ChoiceList } from '@/components/choice-list';
import { useSecondsLeft } from '@/components/countdown';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { FontFamily, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import {
  parseNumber,
  typeHint,
  type AnswerPayload,
  type ChoiceConfig,
  type FreeTextConfig,
  type NumericConfig,
} from '@/lib/question-types';
import type { Question } from '@/lib/types';

type Props = {
  question: Question;
  busy: boolean;
  onSubmit: (payload: AnswerPayload) => void;
  /** Shared start of the question, for the list's auto-submit. */
  startedAt?: string | null;
};

/**
 * The team's input for the current question. Render with `key={question.id}`
 * so the state starts fresh for every question.
 */
export function AnswerInput(props: Props) {
  const { question } = props;
  const t = useT();
  const hint = typeHint(t, question);
  return (
    <View style={{ gap: Spacing.three }}>
      {hint && <ThemedText themeColor="textSecondary">{hint}</ThemedText>}
      {question.type === 'range' || question.type === 'closest' ? (
        <NumericInput {...props} />
      ) : question.type === 'free_text' ? (
        <FreeTextInput {...props} />
      ) : question.type === 'list_timed' ? (
        <ListInput {...props} />
      ) : (
        <ChoiceInput {...props} />
      )}
    </View>
  );
}

function FreeTextInput({ question, busy, onSubmit }: Props) {
  const theme = useTheme();
  const t = useT();
  const fields = (question.config as FreeTextConfig).fields;
  const [answers, setAnswers] = useState(() => Array.from({ length: fields }, () => ''));
  const anyFilled = answers.some((a) => a.trim());

  return (
    <>
      {answers.map((text, i) => (
        <TextInput
          key={i}
          value={text}
          onChangeText={(t) => setAnswers((prev) => prev.map((a, j) => (j === i ? t : a)))}
          placeholder={fields > 1 ? t.answer.answerN(i + 1) : t.common.yourAnswer}
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel={fields > 1 ? t.answer.answerN(i + 1) : t.common.yourAnswer}
          maxLength={120}
          style={[styles.input, styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        />
      ))}
      <Button
        title={t.common.lockIn}
        onPress={() => onSubmit({ answers: answers.map((a) => a.trim()) })}
        loading={busy}
        disabled={!anyFilled}
      />
    </>
  );
}

const MAX_ITEMS = 100;

/**
 * Timed list: add as many entries as possible. The list is locked in
 * automatically when the time runs out (or earlier with the button).
 */
function ListInput({ question, busy, onSubmit, startedAt }: Props) {
  const theme = useTheme();
  const t = useT();
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  function submit() {
    const text = draft.trim();
    // Include what is still in the input field.
    const all = text && items.length < MAX_ITEMS ? [...items, text] : items;
    if (all.length > 0) onSubmit({ items: all });
  }

  const secondsLeft = useSecondsLeft(startedAt ?? null, question.time_limit_s, submit);
  const timeUp = secondsLeft === 0;

  function add() {
    const text = draft.trim();
    if (!text || items.length >= MAX_ITEMS || timeUp) return;
    setItems((prev) => [...prev, text]);
    setDraft('');
    inputRef.current?.focus();
  }

  return (
    <>
      <View style={styles.row}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          submitBehavior="submit"
          editable={!timeUp}
          placeholder={t.answer.listPlaceholder}
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel={t.answer.newEntry}
          maxLength={80}
          autoFocus
          style={[styles.input, styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        />
        <Button title="+" onPress={add} disabled={!draft.trim() || timeUp} />
      </View>

      <ThemedText type="label">
        {t.answer.entries(items.length)}
      </ThemedText>
      <View style={styles.items}>
        {items.map((item, i) => (
          <Pressable
            key={`${i}-${item}`}
            accessibilityRole="button"
            accessibilityLabel={t.answer.remove(item)}
            disabled={timeUp}
            onPress={() => setItems((prev) => prev.filter((_, j) => j !== i))}>
            <Chamfer style={styles.item} cut={7} fill={theme.backgroundElement} stroke={theme.border} strokeWidth={1}>
              <ThemedText style={{ fontWeight: 600 }}>{item}</ThemedText>
              <ThemedText themeColor="textSecondary">✕</ThemedText>
            </Chamfer>
          </Pressable>
        ))}
      </View>

      {timeUp ? (
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          {busy ? t.answer.submittingList : items.length ? t.answer.listTimeUp : t.answer.timeUp}
        </ThemedText>
      ) : (
        <Button title={t.answer.lockListNow} variant="secondary" onPress={submit} loading={busy} disabled={items.length === 0} />
      )}
    </>
  );
}

function ChoiceInput({ question, busy, onSubmit }: Props) {
  const t = useT();
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
        title={multi && selected.length < required ? t.answer.pickMore(required - selected.length) : t.common.lockIn}
        onPress={submit}
        loading={busy}
        disabled={selected.length !== required}
      />
    </>
  );
}

function NumericInput({ question, busy, onSubmit }: Props) {
  const theme = useTheme();
  const t = useT();
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const unit = (question.config as NumericConfig).unit;
  const isRange = question.type === 'range';

  const lowValue = parseNumber(low, t.decimal);
  const highValue = parseNumber(high, t.decimal);
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
          placeholder={isRange ? t.answer.from : t.common.yourAnswer}
          placeholderTextColor={theme.textSecondary}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel={isRange ? t.answer.from : t.common.yourAnswer}
          style={inputStyle}
        />
        {isRange && (
          <>
            <ThemedText style={styles.dash}>–</ThemedText>
            <TextInput
              value={high}
              onChangeText={setHigh}
              placeholder={t.answer.to}
              placeholderTextColor={theme.textSecondary}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel={t.answer.to}
              onSubmitEditing={submit}
              style={inputStyle}
            />
          </>
        )}
        {unit ? <ThemedText style={styles.unit}>{unit}</ThemedText> : null}
      </View>
      {isRange && lowValue !== null && highValue !== null && lowValue > highValue && (
        <ThemedText style={{ color: theme.danger }}>{t.answer.fromAfterTo}</ThemedText>
      )}
      <Button title={t.common.lockIn} onPress={submit} loading={busy} disabled={!valid} />
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
    borderRadius: 2,
    paddingHorizontal: Spacing.three,
    fontSize: 24,
    fontFamily: FontFamily.display[700],
  },
  textInput: { fontSize: 20, fontFamily: FontFamily.body[600] },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  dash: { fontSize: 24, fontWeight: 700 },
  unit: { fontSize: 18, fontWeight: 700 },
});
