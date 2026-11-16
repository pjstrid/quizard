import { DarkTheme, Stack, ThemeProvider } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Screen } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthProvider } from '@/providers/auth-provider';

/** Navigation chrome (headers, backgrounds) in the QUIZARD palette. */
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.background,
    text: Colors.text,
    border: Colors.border,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      {isSupabaseConfigured ? (
        <AuthProvider>
          <Stack screenOptions={{ headerBackTitle: 'Tillbaka' }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="join" options={{ title: 'Gå med' }} />
            <Stack.Screen name="login" options={{ title: 'Quizmaster' }} />
            <Stack.Screen name="play/[sessionId]" options={{ title: 'QUIZARD', headerBackVisible: false }} />
            <Stack.Screen name="host" options={{ headerShown: false }} />
            <Stack.Screen name="tv/index" options={{ title: 'Storskärm' }} />
            <Stack.Screen name="tv/[sessionId]" options={{ headerShown: false }} />
          </Stack>
        </AuthProvider>
      ) : (
        <Screen centered>
          <ThemedText type="subtitle">Supabase är inte konfigurerat</ThemedText>
          <ThemedText>
            Kopiera .env.example till .env, fyll i URL och publishable key från ditt Supabase-projekt och
            starta om Expo.
          </ThemedText>
        </Screen>
      )}
    </ThemeProvider>
  );
}
