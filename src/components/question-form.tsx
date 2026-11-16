import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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

function initialOptions(type: QuestionType) {
  if (type === 'true_false') return ['Sant', 'Falskt'];
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
  const initial = question ? stateFrom(question, answerKey) : null;
  const [type, setType] = useState<QuestionType>(question?.type ?? 'single_choice');
  const [prompt, setPrompt] = useState(question?.prompt ?? '');
  const [options, setOptions] = useState(() => initial?.options ?? initialOptions('single_choice'));
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
    setOptions(initialOptions(next));
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
  const numericValue = parseNumber(value);

  let problem: string | null = null;
  if (!prompt.trim()) problem = 'Skriv en fråga.';
  else if (rules) {
    if (filled.length < rules.min) problem = `Fyll i minst ${rules.min} alternativ.`;
    else if (correctMapped.length < rules.correct[0])
      problem = rules.correct[0] === 1 ? 'Markera rätt svar.' : `Markera ${rules.correct[0]}–${rules.correct[1]} rätta svar.`;
  } else if (isList) {
    if (!timeLimit) problem = 'Välj en tidsgräns.';
  } else if (!isFreeText && numericValue === null) problem = 'Ange rätt svar som ett tal.';

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
    setOptions(initialOptions(type));
    setCorrect([]);
    setValue('');
    setKeyAnswers(['', '', '', '']);
    setListKey('');
    onSaved();
  }

  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {question ? 'REDIGERA FRÅGA' : 'NY FRÅGA'}
      </ThemedText>
      <Chips
        items={CREATABLE_TYPES.map((t) => ({ key: t.type, label: t.label }))}
        value={type}
        onChange={(t) => changeType(t as QuestionType)}
      />

      <TextField label="Fråga" value={prompt} onChangeText={setPrompt} placeholder="Skriv frågan här" maxLength={500} multiline />

      {rules && (
        <>
          <ThemedText type="smallBold">
            {rules.correct[1] === 1
              ? 'Alternativ (tryck på bokstaven för rätt svar)'
              : `Alternativ (markera ${rules.correct[0]}–${rules.correct[1]} rätta)`}
          </ThemedText>
          {options.map((text, i) => {
            const isCorrect = correct.includes(i);
            return (
              <View key={i} style={styles.optionRow}>
                <Pressable
                  accessibilityRole={rules.correct[1] === 1 ? 'radio' : 'checkbox'}
                  accessibilityState={{ checked: isCorrect }}
                  accessibilityLabel={`Markera ${LETTERS[i]} som rätt svar`}
                  onPress={() => toggleCorrect(i)}
                  style={[
                    styles.letter,
                    { borderColor: isCorrect ? theme.success : theme.border },
                    isCorrect && { backgroundColor: theme.success },
                  ]}>
                  <ThemedText style={{ fontWeight: 800, color: isCorrect ? theme.onPrimary : theme.text }}>
                    {isCorrect ? '✓' : LETTERS[i]}
                  </ThemedText>
                </Pressable>
                <TextInput
                  value={text}
                  onChangeText={(t) => setOptions((prev) => prev.map((o, j) => (j === i ? t : o)))}
                  placeholder={i >= rules.min ? 'Valfritt' : `Alternativ ${LETTERS[i]}`}
                  placeholderTextColor={theme.textSecondary}
                  maxLength={120}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />
              </View>
            );
          })}
          {options.length < rules.max && (
            <Button title="+ Lägg till alternativ" variant="secondary" onPress={() => setOptions((prev) => [...prev, ''])} />
          )}
        </>
      )}

      {isFreeText && (
        <>
          <ThemedText type="smallBold">Antal svar per lag</ThemedText>
          <Chips
            items={[1, 2, 3, 4].map((n) => ({ key: String(n), label: String(n) }))}
            value={String(fields)}
            onChange={(k) => setFields(Number(k))}
          />
          <ThemedText type="smallBold">Facit (valfritt)</ThemedText>
          <ThemedText themeColor="textSecondary">
            Svar som matchar facit föreslås som godkända. Du rättar alltid själv innan svaret visas.
          </ThemedText>
          {keyAnswers.slice(0, fields).map((text, i) => (
            <TextInput
              key={i}
              value={text}
              onChangeText={(t) => setKeyAnswers((prev) => prev.map((a, j) => (j === i ? t : a)))}
              placeholder={fields > 1 ? `Rätt svar ${i + 1}` : 'Rätt svar'}
              placeholderTextColor={theme.textSecondary}
              maxLength={120}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            />
          ))}
        </>
      )}

      {isList && (
        <>
          <ThemedText type="smallBold">Godkända svar (valfritt, ett per rad)</ThemedText>
          <ThemedText themeColor="textSecondary">
            Svar som finns i listan föreslås som godkända. Du rättar alltid själv innan svaret visas.
          </ThemedText>
          <TextInput
            value={listKey}
            onChangeText={setListKey}
            placeholder={'Skåne\nUppland\nDalarna'}
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
              label="Rätt svar"
              value={value}
              onChangeText={setValue}
              placeholder="T.ex. 2097"
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Enhet (valfri)" value={unit} onChangeText={setUnit} placeholder="m" maxLength={20} />
          </View>
        </View>
      )}

      <ThemedText type="smallBold">Tidsgräns</ThemedText>
      <Chips
        items={(isList ? LIST_TIME_LIMITS : TIME_LIMITS).map((l) => ({ key: String(l), label: l ? `${l} s` : 'Ingen' }))}
        value={String(timeLimit)}
        onChange={(k) => setTimeLimit(k === 'null' ? null : Number(k))}
      />

      <ThemedText type="smallBold">Poäng</ThemedText>
      <Chips
        items={POINTS.map((p) => ({ key: String(p), label: `${p} p` }))}
        value={String(points)}
        onChange={(k) => setPoints(Number(k))}
      />

      <ErrorText>{error}</ErrorText>
      {problem && prompt.trim() !== '' && <ThemedText themeColor="textSecondary">{problem}</ThemedText>}
      <Button
        title={question ? 'Spara ändringar' : 'Lägg till fråga'}
        onPress={save}
        loading={busy}
        disabled={problem !== null}
      />
      {onCancel && <Button title="Avbryt" variant="secondary" onPress={onCancel} />}
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
            accessibilityState={{ checked: active }}
            onPress={() => onChange(item.key)}
            style={[styles.chip, { borderColor: active ? theme.primary : theme.border }, active && { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={{ color: active ? theme.onPrimary : theme.text }}>
              {item.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
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
  multiline: { minHeight: 120, paddingTop: Spacing.two, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
