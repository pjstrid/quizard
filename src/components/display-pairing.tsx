import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText } from '@/components/ui';
import { useDisplayCount } from '@/hooks/use-displays';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { friendlyError, supabase } from '@/lib/supabase';

/** Where a big screen opens QUIZARD: this site on web, or EXPO_PUBLIC_WEB_URL from the app. */
function tvAddress() {
  const base = Platform.OS === 'web' ? window.location.origin : process.env.EXPO_PUBLIC_WEB_URL;
  return base ? `${base.replace(/\/$/, '')}/tv` : null;
}

/**
 * Host card for pairing a TV/laptop as the big screen. The display code is
 * secret (unlike the join code), so it is only fetched when the host asks.
 */
export function DisplayPairing({ sessionId, compact }: { sessionId: string; compact?: boolean }) {
  const theme = useTheme();
  const t = useT();
  const displays = useDisplayCount(sessionId);
  const [code, setCode] = useState<string | null>(null);
  const [open, setOpen] = useState(!compact);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function showCode() {
    setError(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('get_display_code', { p_session_id: sessionId });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setCode(data as string);
  }

  async function disconnectAll() {
    const { error } = await supabase.from('session_displays').delete().eq('session_id', sessionId);
    if (error) setError(friendlyError(error));
  }

  const status = displays > 0 ? t.display.connected(displays) : null;

  if (!open) {
    return (
      <Button
        title={status ? t.display.showCodeShort(status) : t.display.showOnBigScreen}
        variant="secondary"
        onPress={() => setOpen(true)}
      />
    );
  }

  const address = tvAddress();
  return (
    <Card>
      <ThemedText type="label">
        {t.display.label}
      </ThemedText>
      {status && <ThemedText style={{ color: theme.success, fontWeight: 700 }}>{status}</ThemedText>}
      {code ? (
        <>
          <ThemedText>
            {t.display.openAt}{' '}
            {address ? <ThemedText style={{ fontWeight: 700 }}>{address}</ThemedText> : t.display.inBrowser}{' '}
            {t.display.enterCode}
          </ThemedText>
          <ThemedText display style={[styles.code, { color: theme.primary }]} selectable>
            {code}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{t.display.keepSecret}</ThemedText>
        </>
      ) : (
        <>
          <ThemedText themeColor="textSecondary">{t.display.intro}</ThemedText>
          <Button title={t.display.showCode} onPress={showCode} loading={busy} />
        </>
      )}
      <ErrorText>{error}</ErrorText>
      {displays > 0 && <Button title={t.display.disconnect} variant="danger" onPress={disconnectAll} />}
      {compact && <Button title={t.display.hide} variant="secondary" onPress={() => setOpen(false)} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 44, lineHeight: 54, fontWeight: 800, letterSpacing: 8, textAlign: 'center' },
});
