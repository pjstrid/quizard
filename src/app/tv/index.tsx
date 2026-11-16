import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { FontFamily } from '@/constants/theme';
import { Button, ErrorText, Screen, TextField } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/** Pair this browser (TV/laptop) as the big screen for a game, using the host's display code. */
export default function TvPairScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { session } = useAuth();
  const [code, setCode] = useState(params.code?.toUpperCase() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pair() {
    setError(null);
    setBusy(true);
    try {
      // A big screen needs no account: sign in anonymously the first time.
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
      const { data, error } = await supabase.rpc('pair_display', { p_code: code.trim() });
      if (error) throw error;
      router.replace({ pathname: '/tv/[sessionId]', params: { sessionId: data as string } });
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen centered>
      <ThemedText type="subtitle">Storskärm</ThemedText>
      <ThemedText themeColor="textSecondary">
        Quizmastern hittar skärmkoden i sin app under ”Visa på storskärm”.
      </ThemedText>
      <TextField
        label="Skärmkod"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder="T.ex. X7K2QP"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        onSubmitEditing={() => code.trim().length === 6 && pair()}
        style={{ fontSize: 26, letterSpacing: 6, fontFamily: FontFamily.display[800] }}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Anslut" onPress={pair} loading={busy} disabled={code.trim().length !== 6} />
    </Screen>
  );
}
