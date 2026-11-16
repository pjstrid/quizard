import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { QuestionBody } from '@/components/question-body';
import { QuestionForm } from '@/components/question-form';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ConfirmButton, ErrorText, Screen, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { TYPE_LABELS } from '@/lib/question-types';
import { startSession } from '@/lib/start-session';
import { friendlyError, supabase } from '@/lib/supabase';
import type { Question, Quiz } from '@/lib/types';

type QuestionWithKey = Question & { question_keys: { answer: Record<string, unknown> } | null };

/** Quiz editor: rename, add, edit, reorder and delete questions, delete the quiz. */
export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<QuestionWithKey[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
      setTitle((quizRes.data as Quiz).title);
      setQuestions(questionsRes.data as QuestionWithKey[]);
    });
    return () => {
      active = false;
    };
  }, [id, version]);

  /** Runs a change, shows any error and reloads the list. */
  async function act(key: string, run: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    setBusy(key);
    const { error } = await run();
    setBusy(null);
    if (error) setError(friendlyError(error));
    reload();
  }

  const titleChanged = quiz !== null && title.trim() !== quiz.title && title.trim().length > 0;

  async function start() {
    setBusy('start');
    setError(await startSession(id));
    setBusy(null);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: quiz?.title ?? 'Quiz' }} />

      <Card>
        <TextField label="Quizets namn" value={title} onChangeText={setTitle} maxLength={120} />
        {titleChanged && (
          <Button
            title="Spara namn"
            loading={busy === 'title'}
            onPress={() => act('title', () => supabase.from('quizzes').update({ title: title.trim() }).eq('id', id))}
          />
        )}
      </Card>

      <Button
        title={`Starta spel (${questions.length} ${questions.length === 1 ? 'fråga' : 'frågor'})`}
        onPress={start}
        loading={busy === 'start'}
        disabled={questions.length === 0}
      />
      <ErrorText>{error}</ErrorText>

      {questions.map((q, i) =>
        editingId === q.id ? (
          <QuestionForm
            key={q.id}
            quizId={id}
            question={q}
            answerKey={q.question_keys?.answer}
            onSaved={() => {
              setEditingId(null);
              reload();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <Card key={q.id}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              FRÅGA {i + 1} · {TYPE_LABELS[q.type].toUpperCase()} · {q.points} P
              {q.time_limit_s ? ` · ${q.time_limit_s} S` : ''}
            </ThemedText>
            <ThemedText style={styles.prompt}>{q.prompt}</ThemedText>
            <QuestionBody question={q} answerKey={q.question_keys?.answer} />
            <View style={styles.toolbar}>
              <Button
                title="↑"
                variant="secondary"
                disabled={i === 0 || busy !== null}
                onPress={() => act(`move-${q.id}`, () => supabase.rpc('move_question', { p_question_id: q.id, p_offset: -1 }))}
              />
              <Button
                title="↓"
                variant="secondary"
                disabled={i === questions.length - 1 || busy !== null}
                onPress={() => act(`move-${q.id}`, () => supabase.rpc('move_question', { p_question_id: q.id, p_offset: 1 }))}
              />
              <View style={{ flex: 1 }} />
              <Button title="Redigera" variant="secondary" onPress={() => setEditingId(q.id)} />
              <ConfirmButton
                title="Ta bort"
                loading={busy === `delete-${q.id}`}
                onConfirm={() => act(`delete-${q.id}`, () => supabase.rpc('delete_question', { p_question_id: q.id }))}
              />
            </View>
          </Card>
        ),
      )}

      {editingId === null && <QuestionForm quizId={id} onSaved={reload} />}

      <ConfirmButton
        title="Ta bort quizet"
        confirmTitle="Tryck igen för att ta bort quizet och alla frågor"
        onConfirm={async () => {
          const { error } = await supabase.from('quizzes').delete().eq('id', id);
          if (error) return setError(friendlyError(error));
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  prompt: { fontSize: 18, lineHeight: 24, fontWeight: 700 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
});
