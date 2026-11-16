import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ConfirmButton, ErrorText, Screen, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { friendlyError, supabase } from '@/lib/supabase';
import { startSession } from '@/lib/start-session';
import type { Quiz } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

export default function HostHomeScreen() {
  const { session } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Bump to refetch the list after create/delete.
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let active = true;
    // RLS makes sure we only get our own quizzes – no where clause on owner_id needed.
    supabase
      .from('quizzes')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(friendlyError(error));
        else setQuizzes(data as Quiz[]);
      });
    return () => {
      active = false;
    };
  }, [version]);

  async function createQuiz() {
    setBusy('create');
    const { error } = await supabase.from('quizzes').insert({ title: title.trim() });
    setBusy(null);
    if (error) return setError(friendlyError(error));
    setTitle('');
    reload();
  }

  async function start(quiz: Quiz) {
    setBusy(quiz.id);
    const message = await startSession(quiz.id);
    setBusy(null);
    if (message) setError(message);
  }

  async function deleteQuiz(quiz: Quiz) {
    const { error } = await supabase.from('quizzes').delete().eq('id', quiz.id);
    if (error) return setError(friendlyError(error));
    reload();
  }

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">Inloggad som {session?.user.email}</ThemedText>

      <Card>
        <TextField
          label="Nytt quiz"
          value={title}
          onChangeText={setTitle}
          placeholder="T.ex. Fredagsquiz hos Anna"
          maxLength={120}
          onSubmitEditing={() => title.trim() && createQuiz()}
        />
        <Button title="Skapa quiz" onPress={createQuiz} loading={busy === 'create'} disabled={!title.trim()} />
      </Card>

      <ErrorText>{error}</ErrorText>

      {quizzes.map((quiz) => (
        <Card key={quiz.id}>
          <ThemedText type="smallBold" style={{ fontSize: 20, lineHeight: 26 }}>
            {quiz.title}
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Button title="Starta spel" onPress={() => start(quiz)} loading={busy === quiz.id} />
            </View>
            <Button
              title="Frågor"
              variant="secondary"
              onPress={() => router.push({ pathname: '/host/quiz/[id]', params: { id: quiz.id } })}
            />
            <ConfirmButton title="Ta bort" onConfirm={() => deleteQuiz(quiz)} />
          </View>
        </Card>
      ))}
      {quizzes.length === 0 && <ThemedText themeColor="textSecondary">Du har inga quiz ännu.</ThemedText>}

      <Button title="Logga ut" variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
