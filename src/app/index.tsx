import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function StartScreen() {
  const theme = useTheme();
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
      <Button title="Gå med i ett quiz" onPress={() => router.push('/join')} />
      <Button title="Jag är quizmaster" variant="secondary" onPress={() => router.push('/host')} />
      <Button title="Storskärm" variant="secondary" onPress={() => router.push('/tv')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.five },
  logo: { letterSpacing: 4 },
  center: { textAlign: 'center' },
});
