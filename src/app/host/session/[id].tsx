import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { TeamList } from '@/components/team-list';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Loading, Screen } from '@/components/ui';
import { useSessionLive } from '@/hooks/use-session-live';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

/**
 * The quizmaster's lobby. Shows the join code and the teams joining – live.
 * Stage 2: "Start quiz" + next question / reveal answer.
 */
export default function HostSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { session, teams, loading, error } = useSessionLive(id);

  async function endSession() {
    await supabase.from('game_sessions').delete().eq('id', id);
    router.back();
  }

  if (loading) return <Loading />;
  if (!session) {
    return (
      <Screen centered>
        <ThemedText type="subtitle">Sessionen finns inte längre</ThemedText>
        <ErrorText>{error}</ErrorText>
        <Button title="Tillbaka" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.center}>
          GÅ MED PÅ QUIZARD MED KODEN
        </ThemedText>
        <ThemedText style={[styles.code, { color: theme.primary }]} selectable>
          {session.join_code}
        </ThemedText>
      </Card>

      <TeamList teams={teams} large />

      <Button title="Starta quiz (kommer i etapp 2)" onPress={() => {}} disabled />
      <Button title="Avsluta session" variant="danger" onPress={endSession} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  code: { fontSize: 64, lineHeight: 76, fontWeight: 800, letterSpacing: 10, textAlign: 'center' },
});
