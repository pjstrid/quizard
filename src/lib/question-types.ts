import type { Strings } from '@/i18n';
import type { Question, QuestionType } from '@/lib/types';

/**
 * Per-type formats – mirror supabase/migrations/*_auto_graded_types.sql.
 * Option indexes are 0-based.
 */
export type ChoiceConfig = { options: string[]; pick?: number };
export type NumericConfig = { unit?: string };

export type ChoiceKey = { correct: number | number[] };
export type NumericKey = { value: number };

export type ChoicePayload = { choice: number };
export type MultiChoicePayload = { choices: number[] };
export type RangePayload = { low: number; high: number };
export type ClosestPayload = { value: number };

export type FreeTextConfig = { fields: number };
/** Expected answers for manual types – used to suggest a grading, the quizmaster decides. */
export type ManualKey = { answers: string[] };
export type FreeTextPayload = { answers: string[] };
export type ListPayload = { items: string[] };

export type AnswerPayload =
  | ChoicePayload
  | MultiChoicePayload
  | RangePayload
  | ClosestPayload
  | FreeTextPayload
  | ListPayload;

/** Question templates in the order the quizmaster sees them. Labels live in the translations (`t.types`). */
export const CREATABLE_TYPES: QuestionType[] = [
  'single_choice',
  'multi_choice',
  'true_false',
  'range',
  'closest',
  'free_text',
  'list_timed',
];

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const isChoiceType = (type: QuestionType) =>
  type === 'single_choice' || type === 'multi_choice' || type === 'true_false';

export const isNumericType = (type: QuestionType) => type === 'range' || type === 'closest';

/** Types the quizmaster grades by hand (with a suggestion from the key). */
export const isManualType = (type: QuestionType) => type === 'free_text' || type === 'list_timed';

/** The submitted texts of a manual answer: free_text fields or list items. */
export function manualEntries(question: Question, payload: unknown): string[] {
  if (!payload) return [];
  if (question.type === 'free_text') return (payload as FreeTextPayload).answers ?? [];
  if (question.type === 'list_timed') return (payload as ListPayload).items ?? [];
  return [];
}

/** Short instruction shown with the question. */
export function typeHint(t: Strings, question: Question): string | null {
  switch (question.type) {
    case 'multi_choice':
      return t.hints.pick((question.config as ChoiceConfig).pick ?? 2);
    case 'range':
      return t.hints.range;
    case 'closest':
      return t.hints.closest;
    case 'free_text': {
      const fields = (question.config as FreeTextConfig).fields;
      return fields > 1 ? t.hints.fields(fields) : null;
    }
    case 'list_timed':
      return t.hints.list;
    default:
      return null;
  }
}

export function formatNumber(t: Strings, value: number, unit?: string) {
  const text = value.toLocaleString(t.locale, { maximumFractionDigits: 6 });
  return unit ? `${text} ${unit}` : text;
}

/**
 * Parses user input like "2 097,5" → 2097.5. Returns null when it is not a number.
 * A comma is a decimal separator, except in English where ",ddd" is a thousands
 * separator ("2,097.5"). A dot always works as decimal separator.
 */
export function parseNumber(text: string, decimal: ',' | '.' = ','): number | null {
  let cleaned = text.replace(/\s/g, '');
  if (decimal === '.') cleaned = cleaned.replace(/,(?=\d{3}(\D|$))/g, '');
  cleaned = cleaned.replace(',', '.');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Option indexes picked in a payload (choice types). */
export function pickedIndexes(payload: unknown): number[] {
  const p = payload as Partial<ChoicePayload & MultiChoicePayload> | null | undefined;
  if (!p) return [];
  if (Array.isArray(p.choices)) return p.choices;
  if (typeof p.choice === 'number') return [p.choice];
  return [];
}

/** Correct option indexes from an answer key (choice types). */
export function correctIndexes(key: unknown): number[] {
  const correct = (key as Partial<ChoiceKey> | null | undefined)?.correct;
  if (Array.isArray(correct)) return correct;
  if (typeof correct === 'number') return [correct];
  return [];
}

/** Human-readable answer, e.g. "A · Oslo", "A, D", "90–110 st", "2 100 m". */
export function describeAnswer(t: Strings, question: Question, payload: unknown): string {
  if (isChoiceType(question.type)) {
    const options = (question.config as ChoiceConfig).options;
    const picked = pickedIndexes(payload);
    if (picked.length === 1) return `${LETTERS[picked[0]]} · ${options[picked[0]]}`;
    return picked
      .slice()
      .sort((a, b) => a - b)
      .map((i) => LETTERS[i])
      .join(', ');
  }
  const unit = (question.config as NumericConfig).unit;
  if (question.type === 'range') {
    const { low, high } = payload as RangePayload;
    return `${formatNumber(t, low)}–${formatNumber(t, high, unit)}`;
  }
  if (question.type === 'closest') return formatNumber(t, (payload as ClosestPayload).value, unit);
  if (question.type === 'free_text') {
    const texts = manualEntries(question, payload).filter((t) => t.trim());
    return texts.length ? texts.join(', ') : t.common.empty;
  }
  if (question.type === 'list_timed') return t.answer.entries(manualEntries(question, payload).length);
  return '';
}

/** Human-readable correct answer for numeric types. */
export function describeKey(t: Strings, question: Question, key: unknown): string | null {
  if (!key || !isNumericType(question.type)) return null;
  return formatNumber(t, (key as NumericKey).value, (question.config as NumericConfig).unit);
}

/** Result line shown on the team's phone after reveal. */
export function resultText(
  t: Strings,
  question: Question,
  payload: unknown,
  key: unknown,
  points: number | null,
): { text: string; tone: 'success' | 'danger' | 'neutral' } {
  if (payload == null) return { text: t.common.noAnswer, tone: 'neutral' };
  const won = (points ?? 0) > 0;

  if (question.type === 'multi_choice' && key) {
    const correct = correctIndexes(key);
    const hits = pickedIndexes(payload).filter((i) => correct.includes(i)).length;
    if (correct.length > 2 && won && hits < correct.length) {
      return { text: t.result.partly(hits, correct.length, points ?? 0), tone: 'success' };
    }
  }
  if (!won && key && question.type === 'range') {
    const { low, high } = payload as RangePayload;
    const value = (key as NumericKey).value;
    if (low <= value && value <= high) return { text: t.result.narrowerWon, tone: 'neutral' };
  }
  if (!won && question.type === 'closest') return { text: t.result.someoneCloser, tone: 'danger' };
  // Manual types: points = accepted entries × question points.
  const accepted = Math.round((points ?? 0) / (question.points || 1));
  if (question.type === 'list_timed') {
    return won
      ? { text: t.result.accepted(accepted, points ?? 0), tone: 'success' }
      : { text: t.result.noneAccepted, tone: 'danger' };
  }
  if (question.type === 'free_text' && won) {
    const fields = (question.config as FreeTextConfig).fields;
    if (fields > 1) return { text: t.result.partly(accepted, fields, points ?? 0), tone: 'success' };
  }

  return won ? { text: t.result.right(points ?? 0), tone: 'success' } : { text: t.result.wrong, tone: 'danger' };
}
