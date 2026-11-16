import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';

/** Everything under /host requires a signed-in quizmaster (not an anonymous team). */
export default function HostLayout() {
  const { session, loading, isAnonymous } = useAuth();

  if (loading) return <Loading />;
  if (!session || isAnonymous) return <Redirect href="/login" />;

  return (
    <Stack screenOptions={{ headerBackTitle: 'Tillbaka' }}>
      <Stack.Screen name="index" options={{ title: 'Mina quiz' }} />
      <Stack.Screen name="session/[id]" options={{ title: 'Lobby' }} />
    </Stack>
  );
}
