import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { FontFamily } from '@/constants/theme';
import { useT } from '@/i18n';
import { Button, ErrorText, Screen, TextField } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import type { Team } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

export default function JoinScreen() {
  // ?code=ABC123 prefills the code (for a QR code later on).
  const params = useLocalSearchParams<{ code?: string }>();
  const { session, isAnonymous } = useAuth();
  const t = useT();
  const [code, setCode] = useState(params.code?.toUpperCase() ?? '');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signedInAsHost = session && !isAnonymous;

  async function join() {
    setError(null);
    setBusy(true);
    try {
      // Teams don't need an account: create an anonymous Supabase user the first time.
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
      const { data, error } = await supabase.rpc('join_session', {
        p_code: code.trim(),
        p_team_name: teamName.trim(),
      });
      if (error) throw error;
      const team = data as Team;
      router.replace({ pathname: '/play/[sessionId]', params: { sessionId: team.session_id } });
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setBusy(false);
    }
  }

  if (signedInAsHost) {
    return (
      <Screen centered>
        <ThemedText type="subtitle">{t.join.signedInAsHost}</ThemedText>
        <ThemedText>{t.join.signOutToJoin}</ThemedText>
        <Button title={t.common.signOut} variant="secondary" onPress={() => supabase.auth.signOut()} />
      </Screen>
    );
  }

  return (
    <Screen centered>
      <ThemedText type="subtitle">{t.join.title}</ThemedText>
      <TextField
        label={t.join.code}
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder={t.common.example('K7QM2P')}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        style={{ fontSize: 26, letterSpacing: 6, fontFamily: FontFamily.display[800] }}
      />
      <TextField
        label={t.join.teamName}
        value={teamName}
        onChangeText={setTeamName}
        placeholder={t.common.example(t.join.teamNameExample)}
        maxLength={40}
        returnKeyType="go"
        onSubmitEditing={join}
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title={t.join.submit}
        onPress={join}
        loading={busy}
        disabled={code.trim().length !== 6 || teamName.trim().length === 0}
      />
    </Screen>
  );
}
