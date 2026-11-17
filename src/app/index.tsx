import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chamfer } from '@/components/chamfer';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useResumeTarget, type ResumeTarget } from '@/hooks/use-resume';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES, setLanguage, useLanguage, useT } from '@/i18n';

export default function StartScreen() {
  const theme = useTheme();
  const t = useT();
  const resume = useResumeTarget();
  return (
    <Screen centered>
      <View style={styles.hero}>
        <ThemedText type="title" style={[styles.logo, { color: theme.primary }]}>
          QUIZARD
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {t.start.tagline}
        </ThemedText>
      </View>
      {resume && <ResumeCard target={resume} />}
      <Button title={t.start.join} variant={resume ? 'secondary' : 'primary'} onPress={() => router.push('/join')} />
      <Button title={t.start.host} variant="secondary" onPress={() => router.push('/host')} />
      <Button title={t.start.bigScreen} variant="secondary" onPress={() => router.push('/tv')} />
      <LanguagePicker />
    </Screen>
  );
}

/** Back into a running game after a reload or a closed tab (#6). */
function ResumeCard({ target }: { target: ResumeTarget }) {
  const t = useT();
  const copy = {
    team: { label: t.start.resumeTeamLabel, button: t.start.resumeTeam(target.kind === 'team' ? target.teamName : '') },
    host: { label: t.start.resumeHostLabel, button: t.start.resumeHost },
    display: { label: t.start.resumeDisplayLabel, button: t.start.resumeDisplay },
  }[target.kind];

  function go() {
    if (target.kind === 'team') router.push({ pathname: '/play/[sessionId]', params: { sessionId: target.sessionId } });
    else if (target.kind === 'host') router.push({ pathname: '/host/session/[id]', params: { id: target.sessionId } });
    else router.push({ pathname: '/tv/[sessionId]', params: { sessionId: target.sessionId } });
  }

  return (
    <Card highlight>
      <ThemedText type="label">{copy.label}</ThemedText>
      <ThemedText themeColor="textSecondary">{t.common.code(target.joinCode)}</ThemedText>
      <Button title={copy.button} onPress={go} />
    </Card>
  );
}

/** Switch the UI language on this device (defaults to the device language, #7). */
function LanguagePicker() {
  const theme = useTheme();
  const t = useT();
  const language = useLanguage();
  return (
    <View style={styles.languages} accessibilityRole="radiogroup" accessibilityLabel={t.start.language}>
      {LANGUAGES.map(({ code, name }) => {
        const active = code === language;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={name}
            onPress={() => setLanguage(code)}>
            <Chamfer
              style={styles.language}
              cut={6}
              fill={active ? theme.backgroundSelected : 'transparent'}
              stroke={active ? theme.primary : theme.border}
              strokeWidth={1}>
              <ThemedText display style={[styles.languageText, { color: active ? theme.primary : theme.textSecondary }]}>
                {name}
              </ThemedText>
            </Chamfer>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.five },
  logo: { letterSpacing: 4 },
  center: { textAlign: 'center' },
  languages: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two, marginTop: Spacing.three },
  language: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  languageText: { fontSize: 11, lineHeight: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' },
});
