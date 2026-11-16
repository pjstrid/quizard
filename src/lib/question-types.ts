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

export type AnswerPayload = ChoicePayload | MultiChoicePayload | RangePayload | ClosestPayload;

/** Types the quizmaster can create today (manual types come with #3). */
export const CREATABLE_TYPES: { type: QuestionType; label: string }[] = [
  { type: 'single_choice', label: 'Flerval' },
  { type: 'multi_choice', label: 'Flera rätt' },
  { type: 'true_false', label: '50/50' },
  { type: 'range', label: 'Spann' },
  { type: 'closest', label: 'Närmast' },
];

export const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: 'Flerval',
  multi_choice: 'Flera rätt',
  true_false: '50/50',
  range: 'Spann',
  closest: 'Närmast vinner',
  free_text: 'Fritext',
  list_timed: 'Lista',
};

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const isChoiceType = (type: QuestionType) =>
  type === 'single_choice' || type === 'multi_choice' || type === 'true_false';

export const isNumericType = (type: QuestionType) => type === 'range' || type === 'closest';

/** Short instruction shown with the question. */
export function typeHint(question: Question): string | null {
  switch (question.type) {
    case 'multi_choice':
      return `Välj ${(question.config as ChoiceConfig).pick} alternativ`;
    case 'range':
      return 'Ange ett spann. Det smalaste spannet som innehåller rätt svar vinner.';
    case 'closest':
      return 'Gissa ett tal. Närmast rätt svar vinner.';
    default:
      return null;
  }
}

export function formatNumber(value: number, unit?: string) {
  const text = value.toLocaleString('sv-SE', { maximumFractionDigits: 6 });
  return unit ? `${text} ${unit}` : text;
}

/** Parses user input like "2 097,5" → 2097.5. Returns null when it is not a number. */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/\s/g, '').replace(',', '.');
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
export function describeAnswer(question: Question, payload: unknown): string {
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
    return `${formatNumber(low)}–${formatNumber(high, unit)}`;
  }
  if (question.type === 'closest') return formatNumber((payload as ClosestPayload).value, unit);
  return '';
}

/** Human-readable correct answer for numeric types. */
export function describeKey(question: Question, key: unknown): string | null {
  if (!key || !isNumericType(question.type)) return null;
  return formatNumber((key as NumericKey).value, (question.config as NumericConfig).unit);
}
