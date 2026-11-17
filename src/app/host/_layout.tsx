import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/ui';
import { stackScreenOptions } from '@/constants/theme';
import { useT } from '@/i18n';
import { useAuth } from '@/providers/auth-provider';

/** Everything under /host requires a signed-in quizmaster (not an anonymous team). */
export default function HostLayout() {
  const { session, loading, isAnonymous } = useAuth();
  const t = useT();

  if (loading) return <Loading />;
  if (!session || isAnonymous) return <Redirect href="/login" />;

  return (
    <Stack screenOptions={{ ...stackScreenOptions, headerBackTitle: t.common.back }}>
      <Stack.Screen name="index" options={{ title: t.nav.myQuizzes }} />
      <Stack.Screen name="quiz/[id]" options={{ title: t.nav.quiz }} />
      <Stack.Screen name="session/[id]" options={{ title: t.nav.game }} />
    </Stack>
  );
}
