import { router } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen, TextField } from '@/components/ui';
import { strings, useT } from '@/i18n';
import { friendlyError, supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<'login' | 'signup' | null>(null);

  async function submit(mode: 'login' | 'signup') {
    setError(null);
    setInfo(null);
    setBusy(mode);
    const credentials = { email: email.trim(), password };
    const { data, error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
    setBusy(null);

    if (error) return setError(friendlyError(error));
    // With "Confirm email" turned on in Supabase, sign-up returns no session.
    if (!data.session) return setInfo(strings().login.confirmEmail);
    router.replace('/host');
  }

  const valid = email.includes('@') && password.length >= 6;

  return (
    <Screen centered>
      <ThemedText type="subtitle">{t.login.title}</ThemedText>
      <TextField
        label={t.login.email}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <TextField
        label={t.login.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        onSubmitEditing={() => valid && submit('login')}
      />
      <ErrorText>{error}</ErrorText>
      {info && <ThemedText>{info}</ThemedText>}
      <Button title={t.login.signIn} onPress={() => submit('login')} loading={busy === 'login'} disabled={!valid} />
      <Button
        title={t.login.signUp}
        variant="secondary"
        onPress={() => submit('signup')}
        loading={busy === 'signup'}
        disabled={!valid}
      />
    </Screen>
  );
}
