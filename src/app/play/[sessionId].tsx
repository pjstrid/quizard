import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { TeamList } from '@/components/team-list';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Loading, Screen } from '@/components/ui';
import { useSessionLive } from '@/hooks/use-session-live';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/** The team's view. Stage 1: lobby only. Questions arrive in stage 2. */
export default function PlayScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { session: auth } = useAuth();
  const { session, teams, loading, error } = useSessionLive(sessionId);

  const myTeam = teams.find((t) => t.user_id === auth?.user.id);

  async function leave() {
    if (myTeam) await supabase.from('teams').delete().eq('id', myTeam.id);
    router.replace('/');
  }

  if (loading) return <Loading />;

  if (!session || !myTeam) {
    return (
      <Screen centered>
        <ThemedText type="subtitle">Ni är inte med i det här quizet</ThemedText>
        <ErrorText>{error}</ErrorText>
        <Button title="Till start" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary">
          NI ÄR MED SOM
        </ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: myTeam.color }} />
          <ThemedText type="subtitle">{myTeam.name}</ThemedText>
        </View>
      </Card>

      {session.status === 'lobby' && (
        <ThemedText>Väntar på att quizmastern startar quizet …</ThemedText>
      )}
      {session.status === 'playing' && <ThemedText>Quizet är igång! (Frågor kommer i etapp 2.)</ThemedText>}
      {session.status === 'finished' && <ThemedText>Quizet är slut. Tack för att ni var med!</ThemedText>}

      <TeamList teams={teams} />
      <Button title="Lämna quizet" variant="danger" onPress={leave} />
    </Screen>
  );
}
