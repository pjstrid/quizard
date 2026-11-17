import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chamfer } from '@/components/chamfer';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, TextField } from '@/components/ui';
import { FontFamily, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT, type Strings } from '@/i18n';
import {
  CREATABLE_TYPES,
  LETTERS,
  correctIndexes,
  isNumericType,
  parseNumber,
  type ChoiceConfig,
  type FreeTextConfig,
  type ManualKey,
  type NumericConfig,
  type NumericKey,
} from '@/lib/question-types';
import { friendlyError, supabase } from '@/lib/supabase';
import type { Question, QuestionType } from '@/lib/types';

const TIME_LIMITS: (number | null)[] = [null, 15, 30, 60];
const LIST_TIME_LIMITS = [30, 60, 90, 120];
const POINTS = [1, 2, 3, 5];

/** Option rules per choice type – the database validates the same limits. */
const OPTION_RULES: Partial<Record<QuestionType, { start: number; min: number; max: number; correct: [number, number] }>> = {
  single_choice: { start: 4, min: 3, max: 4, correct: [1, 1] },
  multi_choice: { start: 6, min: 5, max: 8, correct: [2, 3] },
  true_false: { start: 2, min: 2, max: 2, correct: [1, 1] },
};

function initialOptions(t: Strings, type: QuestionType) {
  if (type === 'true_false') return [t.form.trueOption, t.form.falseOption];
  return Array.from({ length: OPTION_RULES[type]?.start ?? 0 }, () => '');
}

/** Form state for an existing question (edit mode). */
function stateFrom(question: Question, key: unknown) {
  const config = question.config as ChoiceConfig & NumericConfig & FreeTextConfig;
  const rules = OPTION_RULES[question.type];
  // Pad choice options so an optional extra option can still be filled in.
  const options = rules
    ? [...config.options, ...Array.from({ length: Math.max(0, rules.start - config.options.length) }, () => '')]
    : [];
  const keyAnswers = (key as ManualKey | null)?.answers ?? [];
  return {
    options,
    correct: rules ? correctIndexes(key) : [],
    value: isNumericType(question.type) ? String((key as NumericKey | null)?.value ?? '') : '',
    unit: config.unit ?? '',
    fields: config.fields ?? 1,
    keyAnswers: [...keyAnswers, '', '', '', ''].slice(0, 4),
    listKey: question.type === 'list_timed' ? keyAnswers.join('\n') : '',
  };
}

type Props = {
  quizId: string;
  /** Edit this question instead of creating a new one. Render with `key={question.id}`. */
  question?: Question;
  answerKey?: unknown;
  onSaved: () => void;
  onCancel?: () => void;
};

/** Create or edit a question using one of the seven templates. */
export function QuestionForm({ quizId, question, answerKey, onSaved, onCancel }: Props) {
  const theme = useTheme();
  const t = useT();
  const initial = question ? stateFrom(question, answerKey) : null;
  const [type, setType] = useState<QuestionType>(question?.type ?? 'single_choice');
  const [prompt, setPrompt] = useState(question?.prompt ?? '');
  const [options, setOptions] = useState(() => initial?.options ?? initialOptions(t, 'single_choice'));
  const [correct, setCorrect] = useState<number[]>(initial?.correct ?? []);
  const [value, setValue] = useState(initial?.value ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [fields, setFields] = useState(initial?.fields ?? 1);
  const [keyAnswers, setKeyAnswers] = useState(initial?.keyAnswers ?? ['', '', '', '']);
  const [listKey, setListKey] = useState(initial?.listKey ?? '');
  const [timeLimit, setTimeLimit] = useState<number | null>(question ? question.time_limit_s : 30);
  const [points, setPoints] = useState(question?.points ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = OPTION_RULES[type];
  const isList = type === 'list_timed';
  const isFreeText = type === 'free_text';

  function changeType(next: QuestionType) {
    setType(next);
    setOptions(initialOptions(t, next));
    setCorrect([]);
    setError(null);
    // A list question always runs against the clock.
    if (next === 'list_timed' && !LIST_TIME_LIMITS.includes(timeLimit ?? 0)) setTimeLimit(60);
  }

  function toggleCorrect(index: number) {
    if (!rules) return;
    const [, max] = rules.correct;
    if (max === 1) return setCorrect([index]);
    setCorrect((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : prev.length < max ? [...prev, index] : prev,
    );
  }

  // Empty options are dropped; keep track of where the correct ones end up.
  const filled = options.map((text, index) => ({ text: text.trim(), index })).filter((o) => o.text);
  const correctMapped = filled.flatMap((o, i) => (correct.includes(o.index) ? [i] : []));
  const numericValue = parseNumber(value, t.decimal);

  let problem: string | null = null;
  if (!prompt.trim()) problem = t.form.problemPrompt;
  else if (rules) {
    if (filled.length < rules.min) problem = t.form.problemOptions(rules.min);
    else if (correctMapped.length < rules.correct[0])
      problem = rules.correct[0] === 1 ? t.form.problemCorrect : t.form.problemCorrectRange(rules.correct[0], rules.correct[1]);
  } else if (isList) {
    if (!timeLimit) problem = t.form.problemTimeLimit;
  } else if (!isFreeText && numericValue === null) problem = t.form.problemNumber;

  function buildRequest() {
    if (rules) {
      const config: Record<string, unknown> = { options: filled.map((o) => o.text) };
      if (type === 'multi_choice') config.pick = correctMapped.length;
      return { config, answer: { correct: type === 'multi_choice' ? correctMapped : correctMapped[0] } };
    }
    if (isFreeText) {
      const answers = keyAnswers.slice(0, fields).map((a) => a.trim()).filter(Boolean);
      return { config: { fields }, answer: { answers } };
    }
    if (isList) {
      const answers = listKey.split('\n').map((a) => a.trim()).filter(Boolean).slice(0, 300);
      return { config: {}, answer: { answers } };
    }
    return { config: unit.trim() ? { unit: unit.trim() } : {}, answer: { value: numericValue } };
  }

  async function save() {
    setError(null);
    setBusy(true);
    const { config, answer } = buildRequest();
    const params = {
      p_type: type,
      p_prompt: prompt.trim(),
      p_config: config,
      p_answer: answer,
      p_time_limit_s: timeLimit,
      p_points: points,
    };
    const { error } = question
      ? await supabase.rpc('update_question', { p_question_id: question.id, ...params })
      : await supabase.rpc('create_question', { p_quiz_id: quizId, ...params });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    if (question) return onSaved();
    setPrompt('');
    setOptions(initialOptions(t, type));
    setCorrect([]);
    setValue('');
    setKeyAnswers(['', '', '', '']);
    setListKey('');
    onSaved();
  }

  return (
    <Card>
      <ThemedText type="label">
        {question ? t.form.editQuestion : t.form.newQuestion}
      </ThemedText>
      <Chips
        items={CREATABLE_TYPES.map((type) => ({ key: type, label: t.types[type] }))}
        value={type}
        onChange={(t) => changeType(t as QuestionType)}
      />

      <TextField
        label={t.form.question}
        value={prompt}
        onChangeText={setPrompt}
        placeholder={t.form.questionPlaceholder}
        maxLength={500}
        multiline
      />

      {rules && (
        <>
          <ThemedText type="label">
            {rules.correct[1] === 1
              ? t.form.optionsSingle
              : t.form.optionsMulti(rules.correct[0], rules.correct[1])}
          </ThemedText>
          {options.map((text, i) => {
            const isCorrect = correct.includes(i);
            return (
              <View key={i} style={styles.optionRow}>
                <Pressable
                  accessibilityRole={rules.correct[1] === 1 ? 'radio' : 'checkbox'}
                  accessibilityState={{ checked: isCorrect }}
                  accessibilityLabel={t.form.markCorrect(LETTERS[i])}
                  onPress={() => toggleCorrect(i)}>
                  <Chamfer
                    style={styles.letter}
                    corners="all"
                    cut={8}
                    fill={isCorrect ? theme.success : theme.background}
                    stroke={isCorrect ? theme.success : theme.border}>
                    <ThemedText display style={{ fontWeight: 800, color: isCorrect ? theme.onSuccess : theme.text }}>
                      {isCorrect ? '✓' : LETTERS[i]}
                    </ThemedText>
                  </Chamfer>
                </Pressable>
                <TextInput
                  value={text}
                  onChangeText={(text) => setOptions((prev) => prev.map((o, j) => (j === i ? text : o)))}
                  placeholder={i >= rules.min ? t.form.optional : t.form.option(LETTERS[i])}
                  placeholderTextColor={theme.textSecondary}
                  maxLength={120}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />
              </View>
            );
          })}
          {options.length < rules.max && (
            <Button title={t.form.addOption} variant="secondary" onPress={() => setOptions((prev) => [...prev, ''])} />
          )}
        </>
      )}

      {isFreeText && (
        <>
          <ThemedText type="label">{t.form.answersPerTeam}</ThemedText>
          <Chips
            items={[1, 2, 3, 4].map((n) => ({ key: String(n), label: String(n) }))}
            value={String(fields)}
            onChange={(k) => setFields(Number(k))}
          />
          <ThemedText type="label">{t.form.keyOptional}</ThemedText>
          <ThemedText themeColor="textSecondary">{t.form.keyHint}</ThemedText>
          {keyAnswers.slice(0, fields).map((text, i) => (
            <TextInput
              key={i}
              value={text}
              onChangeText={(text) => setKeyAnswers((prev) => prev.map((a, j) => (j === i ? text : a)))}
              placeholder={fields > 1 ? t.form.correctN(i + 1) : t.common.correctAnswer}
              placeholderTextColor={theme.textSecondary}
              maxLength={120}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            />
          ))}
        </>
      )}

      {isList && (
        <>
          <ThemedText type="label">{t.form.listKey}</ThemedText>
          <ThemedText themeColor="textSecondary">{t.form.listKeyHint}</ThemedText>
          <TextInput
            value={listKey}
            onChangeText={setListKey}
            placeholder={t.form.listKeyPlaceholder}
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[
              styles.input,
              styles.multiline,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
            ]}
          />
        </>
      )}

      {!rules && !isFreeText && !isList && (
        <View style={styles.optionRow}>
          <View style={{ flex: 2 }}>
            <TextField
              label={t.common.correctAnswer}
              value={value}
              onChangeText={setValue}
              placeholder={t.common.example('2097')}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={t.form.unit} value={unit} onChangeText={setUnit} placeholder="m" maxLength={20} />
          </View>
        </View>
      )}

      <ThemedText type="label">{t.form.timeLimit}</ThemedText>
      <Chips
        items={(isList ? LIST_TIME_LIMITS : TIME_LIMITS).map((l) => ({ key: String(l), label: l ? t.common.seconds(l) : t.form.noTimeLimit }))}
        value={String(timeLimit)}
        onChange={(k) => setTimeLimit(k === 'null' ? null : Number(k))}
      />

      <ThemedText type="label">{t.form.points}</ThemedText>
      <Chips
        items={POINTS.map((p) => ({ key: String(p), label: t.common.points(p) }))}
        value={String(points)}
        onChange={(k) => setPoints(Number(k))}
      />

      <ErrorText>{error}</ErrorText>
      {problem && prompt.trim() !== '' && <ThemedText themeColor="textSecondary">{problem}</ThemedText>}
      <Button
        title={question ? t.form.save : t.form.add}
        onPress={save}
        loading={busy}
        disabled={problem !== null}
      />
      {onCancel && <Button title={t.common.cancel} variant="secondary" onPress={onCancel} />}
    </Card>
  );
}

function Chips({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chips}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="radio"
            accessibilityLabel={item.label}
            accessibilityState={{ checked: active }}
            onPress={() => onChange(item.key)}>
            <Chamfer
              style={styles.chip}
              corners="tl-br"
              cut={8}
              fill={active ? theme.primary : 'transparent'}
              stroke={active ? theme.primary : theme.border}>
              <ThemedText display style={[styles.chipText, { color: active ? theme.onPrimary : theme.text }]}>
                {item.label}
              </ThemedText>
            </Chamfer>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  letter: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    fontFamily: FontFamily.body[600],
  },
  multiline: { minHeight: 120, paddingTop: Spacing.two, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  chip: { paddingHorizontal: Spacing.three + 2, paddingVertical: Spacing.two + 2 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' },
});
