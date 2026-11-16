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
  pickedIndexes,
  typeHint,
  type ChoiceConfig,
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
};

/** Read-only view of a question: options or numeric answers, with the correct answer when given. */
export function QuestionBody({ question, answerKey, payload, large, hideHint }: Props) {
  const theme = useTheme();
  const hint = hideHint ? null : typeHint(question);

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
