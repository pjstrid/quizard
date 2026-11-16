import { View } from 'react-native';

import { ChoiceList } from '@/components/choice-list';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  correctIndexes,
  describeAnswer,
  describeKey,
  isChoiceType,
  isManualType,
  manualEntries,
  pickedIndexes,
  typeHint,
  type ChoiceConfig,
  type ManualKey,
} from '@/lib/question-types';
import type { Question } from '@/lib/types';

type Props = {
  question: Question;
  /** Pass to show the correct answer (after reveal, or for the quiz author). */
  answerKey?: unknown;
  /** A team's answer to show (their own phone). */
  payload?: unknown;
  large?: boolean;
  /** Hide the type hint (e.g. in the quiz editor list). */
  hideHint?: boolean;
  /** Manual types: accepted/rejected per entry, shown after reveal. */
  grading?: boolean[] | null;
};

/** Read-only view of a question: options or numeric answers, with the correct answer when given. */
export function QuestionBody({ question, answerKey, payload, large, hideHint, grading }: Props) {
  const theme = useTheme();
  const hint = hideHint ? null : typeHint(question);

  if (isManualType(question.type)) {
    const entries = manualEntries(question, payload);
    const keyAnswers = (answerKey as ManualKey | null | undefined)?.answers ?? [];
    return (
      <View style={{ gap: 8 }}>
        {hint && <ThemedText themeColor="textSecondary">{hint}</ThemedText>}
        {payload != null && (
          <Card>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ERT SVAR
            </ThemedText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {entries.map((text, i) => {
                const mark = grading ? (grading[i] ? '✓' : '✗') : null;
                const color = grading ? (grading[i] ? theme.success : theme.danger) : theme.text;
                return (
                  <ThemedText key={i} style={{ fontSize: large ? 20 : 16, fontWeight: 600, color }}>
                    {mark ? `${mark} ` : ''}
                    {text.trim() || '(tomt)'}
                  </ThemedText>
                );
              })}
            </View>
          </Card>
        )}
        {answerKey != null && keyAnswers.length > 0 && (
          <Card>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {question.type === 'list_timed' ? 'GODKÄNDA SVAR' : 'FACIT'}
            </ThemedText>
            <ThemedText style={{ fontSize: large ? 22 : 18, lineHeight: large ? 30 : 24, fontWeight: 700, color: theme.success }}>
              {keyAnswers.join(', ')}
            </ThemedText>
          </Card>
        )}
      </View>
    );
  }

  if (isChoiceType(question.type)) {
    return (
      <View style={{ gap: 8 }}>
        {hint && <ThemedText themeColor="textSecondary">{hint}</ThemedText>}
        <ChoiceList
          large={large}
          options={(question.config as ChoiceConfig).options}
          selected={pickedIndexes(payload)}
          correct={answerKey ? correctIndexes(answerKey) : null}
        />
      </View>
    );
  }

  const correct = describeKey(question, answerKey);
  return (
    <View style={{ gap: 8 }}>
      {hint && <ThemedText themeColor="textSecondary">{hint}</ThemedText>}
      {payload != null && (
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            ERT SVAR
          </ThemedText>
          <ThemedText style={{ fontSize: large ? 28 : 20, lineHeight: large ? 34 : 26, fontWeight: 700 }}>
            {describeAnswer(question, payload)}
          </ThemedText>
        </Card>
      )}
      {correct && (
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            RÄTT SVAR
          </ThemedText>
          <ThemedText
            style={{ fontSize: large ? 36 : 22, lineHeight: large ? 44 : 28, fontWeight: 800, color: theme.success }}>
            {correct}
          </ThemedText>
        </Card>
      )}
    </View>
  );
}
