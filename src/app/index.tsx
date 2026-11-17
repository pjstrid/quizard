import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useResumeTarget, type ResumeTarget } from '@/hooks/use-resume';
import { useTheme } from '@/hooks/use-theme';

export default function StartScreen() {
  const theme = useTheme();
  const resume = useResumeTarget();
  return (
    <Screen centered>
      <View style={styles.hero}>
        <ThemedText type="title" style={[styles.logo, { color: theme.primary }]}>
          QUIZARD
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          Bygg ett quiz åt dina vänner. Lagen svarar från mobilen och resultatet syns live.
        </ThemedText>
      </View>
      {resume && <ResumeCard target={resume} />}
      <Button title="Gå med i ett quiz" variant={resume ? 'secondary' : 'primary'} onPress={() => router.push('/join')} />
      <Button title="Jag är quizmaster" variant="secondary" onPress={() => router.push('/host')} />
      <Button title="Storskärm" variant="secondary" onPress={() => router.push('/tv')} />
    </Screen>
  );
}

/** Back into a running game after a reload or a closed tab (#6). */
function ResumeCard({ target }: { target: ResumeTarget }) {
  const copy = {
    team: { label: 'DU ÄR MED I ETT QUIZ', button: `Fortsätt som ${target.kind === 'team' ? target.teamName : ''}` },
    host: { label: 'DITT SPEL PÅGÅR', button: 'Fortsätt spelet' },
    display: { label: 'STORSKÄRMEN ÄR ANSLUTEN', button: 'Fortsätt visa' },
  }[target.kind];

  function go() {
    if (target.kind === 'team') router.push({ pathname: '/play/[sessionId]', params: { sessionId: target.sessionId } });
    else if (target.kind === 'host') router.push({ pathname: '/host/session/[id]', params: { id: target.sessionId } });
    else router.push({ pathname: '/tv/[sessionId]', params: { sessionId: target.sessionId } });
  }

  return (
    <Card highlight>
      <ThemedText type="label">{copy.label}</ThemedText>
      <ThemedText themeColor="textSecondary">Kod {target.joinCode}</ThemedText>
      <Button title={copy.button} onPress={go} />
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.five },
  logo: { letterSpacing: 4 },
  center: { textAlign: 'center' },
});
