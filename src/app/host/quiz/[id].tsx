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
import type { GameSession, Question, Quiz } from '@/lib/types';

type QuestionWithKey = Question & { question_keys: { answer: Record<string, unknown> } | null };

/** Quiz editor: rename, add, edit, reorder and delete questions, delete the quiz. */
export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<QuestionWithKey[]>([]);
  // Running games with this quiz – the database refuses edits while one is going.
  const [running, setRunning] = useState<Pick<GameSession, 'id' | 'join_code'>[]>([]);
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
      supabase.from('game_sessions').select('id, join_code').eq('quiz_id', id).eq('status', 'playing'),
    ]).then(([quizRes, questionsRes, runningRes]) => {
      if (!active) return;
      if (quizRes.error || questionsRes.error) return setError(friendlyError(quizRes.error ?? questionsRes.error));
      setQuiz(quizRes.data as Quiz);
      setTitle((quizRes.data as Quiz).title);
      setQuestions(questionsRes.data as QuestionWithKey[]);
      setRunning((runningRes.data ?? []) as Pick<GameSession, 'id' | 'join_code'>[]);
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
  const inPlay = running.length > 0;

  async function finishRunning() {
    setError(null);
    setBusy('finish');
    for (const game of running) {
      const { error } = await supabase.rpc('finish_quiz', { p_session_id: game.id });
      if (error) setError(friendlyError(error));
    }
    setBusy(null);
    reload();
  }

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

      {inPlay && (
        <Card>
          <ThemedText type="smallBold">Ett spel med det här quizet pågår</ThemedText>
          <ThemedText themeColor="textSecondary">
            Frågorna kan inte ändras förrän spelet är avslutat (kod {running.map((g) => g.join_code).join(', ')}).
          </ThemedText>
          <Button
            title="Gå till spelet"
            variant="secondary"
            onPress={() => router.push({ pathname: '/host/session/[id]', params: { id: running[0].id } })}
          />
          <ConfirmButton title="Avsluta spelet" onConfirm={finishRunning} loading={busy === 'finish'} />
        </Card>
      )}

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
                accessibilityLabel="Flytta upp"
                variant="secondary"
                disabled={i === 0 || busy !== null || inPlay}
                onPress={() => act(`move-${q.id}`, () => supabase.rpc('move_question', { p_question_id: q.id, p_offset: -1 }))}
              />
              <Button
                title="↓"
                accessibilityLabel="Flytta ner"
                variant="secondary"
                disabled={i === questions.length - 1 || busy !== null || inPlay}
                onPress={() => act(`move-${q.id}`, () => supabase.rpc('move_question', { p_question_id: q.id, p_offset: 1 }))}
              />
              <View style={{ flex: 1 }} />
              <Button title="Redigera" variant="secondary" disabled={inPlay} onPress={() => setEditingId(q.id)} />
              <ConfirmButton
                title="Ta bort"
                disabled={inPlay}
                loading={busy === `delete-${q.id}`}
                onConfirm={() => act(`delete-${q.id}`, () => supabase.rpc('delete_question', { p_question_id: q.id }))}
              />
            </View>
          </Card>
        ),
      )}

      {editingId === null && !inPlay && <QuestionForm quizId={id} onSaved={reload} />}

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
