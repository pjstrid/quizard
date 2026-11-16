import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ChoiceList } from '@/components/choice-list';
import { SingleChoiceForm } from '@/components/single-choice-form';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { startSession } from '@/lib/start-session';
import { friendlyError, supabase } from '@/lib/supabase';
import type { Question, Quiz, SingleChoiceConfig, SingleChoiceKey } from '@/lib/types';

type QuestionWithKey = Question & { question_keys: { answer: Record<string, unknown> } | null };

/** The quizmaster's questions for one quiz. */
export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuestionWithKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('quizzes').select('*').eq('id', id).single(),
      // Embedded select: Supabase joins question_keys through the foreign key.
      supabase.from('questions').select('*, question_keys(answer)').eq('quiz_id', id).order('position'),
    ]).then(([quizRes, questionsRes]) => {
      if (!active) return;
      if (quizRes.error || questionsRes.error) return setError(friendlyError(quizRes.error ?? questionsRes.error));
      setQuiz(quizRes.data as Quiz);
      setQuestions(questionsRes.data as QuestionWithKey[]);
    });
    return () => {
      active = false;
    };
  }, [id, version]);

  async function deleteQuestion(questionId: string) {
    const { error } = await supabase.from('questions').delete().eq('id', questionId);
    if (error) return setError(friendlyError(error));
    reload();
  }

  async function start() {
    setStarting(true);
    setError(await startSession(id));
    setStarting(false);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: quiz?.title ?? 'Quiz' }} />

      <Button
        title={`Starta spel (${questions.length} ${questions.length === 1 ? 'fråga' : 'frågor'})`}
        onPress={start}
        loading={starting}
        disabled={questions.length === 0}
      />
      <ErrorText>{error}</ErrorText>

      {questions.map((q, i) => (
        <Card key={q.id}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            FRÅGA {i + 1}
            {q.time_limit_s ? ` · ${q.time_limit_s} s` : ''}
          </ThemedText>
          <ThemedText style={{ fontSize: 18, fontWeight: 700 }}>{q.prompt}</ThemedText>
          {q.type === 'single_choice' && (
            <ChoiceList
              options={(q.config as SingleChoiceConfig).options}
              correct={(q.question_keys?.answer as SingleChoiceKey | undefined)?.correct ?? null}
            />
          )}
          <View style={{ alignItems: 'flex-end', marginTop: Spacing.one }}>
            <Button title="Ta bort" variant="danger" onPress={() => deleteQuestion(q.id)} />
          </View>
        </Card>
      ))}

      <SingleChoiceForm quizId={id} onCreated={reload} />
    </Screen>
  );
}
