import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/ui';
import { stackScreenOptions } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

/** Everything under /host requires a signed-in quizmaster (not an anonymous team). */
export default function HostLayout() {
  const { session, loading, isAnonymous } = useAuth();

  if (loading) return <Loading />;
  if (!session || isAnonymous) return <Redirect href="/login" />;

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Mina quiz' }} />
      <Stack.Screen name="quiz/[id]" options={{ title: 'Quiz' }} />
      <Stack.Screen name="session/[id]" options={{ title: 'Spel' }} />
    </Stack>
  );
}
