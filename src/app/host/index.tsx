import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ConfirmButton, ErrorText, Screen, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useT } from '@/i18n';
import { friendlyError, supabase } from '@/lib/supabase';
import { startSession } from '@/lib/start-session';
import type { Quiz } from '@/lib/types';
import { useResumeTarget } from '@/hooks/use-resume';
import { useAuth } from '@/providers/auth-provider';

export default function HostHomeScreen() {
  const { session } = useAuth();
  const t = useT();
  const resume = useResumeTarget();
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
      <ThemedText themeColor="textSecondary">{t.hostHome.signedInAs(session?.user.email ?? '')}</ThemedText>

      {resume?.kind === 'host' && (
        <Card highlight>
          <ThemedText type="label">{resume.status === 'lobby' ? t.hostHome.openLobby : t.hostHome.gameRunning}</ThemedText>
          <ThemedText themeColor="textSecondary">{t.common.code(resume.joinCode)}</ThemedText>
          <Button
            title={t.hostHome.resume}
            onPress={() => router.push({ pathname: '/host/session/[id]', params: { id: resume.sessionId } })}
          />
        </Card>
      )}

      <Card>
        <TextField
          label={t.hostHome.newQuiz}
          value={title}
          onChangeText={setTitle}
          placeholder={t.common.example(t.hostHome.newQuizExample)}
          maxLength={120}
          onSubmitEditing={() => title.trim() && createQuiz()}
        />
        <Button title={t.hostHome.create} onPress={createQuiz} loading={busy === 'create'} disabled={!title.trim()} />
      </Card>

      <ErrorText>{error}</ErrorText>

      {quizzes.map((quiz) => (
        <Card key={quiz.id}>
          <ThemedText type="smallBold" style={{ fontSize: 20, lineHeight: 26 }}>
            {quiz.title}
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Button title={t.hostHome.startGame} onPress={() => start(quiz)} loading={busy === quiz.id} />
            </View>
            <Button
              title={t.hostHome.questions}
              variant="secondary"
              onPress={() => router.push({ pathname: '/host/quiz/[id]', params: { id: quiz.id } })}
            />
            <ConfirmButton title={t.common.delete} onConfirm={() => deleteQuiz(quiz)} />
          </View>
        </Card>
      ))}
      {quizzes.length === 0 && <ThemedText themeColor="textSecondary">{t.hostHome.noQuizzes}</ThemedText>}

      <Button title={t.common.signOut} variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
