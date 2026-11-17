import { ChakraPetch_400Regular, ChakraPetch_500Medium, ChakraPetch_600SemiBold, ChakraPetch_700Bold } from '@expo-google-fonts/chakra-petch';
import {
  Orbitron_500Medium,
  Orbitron_600SemiBold,
  Orbitron_700Bold,
  Orbitron_800ExtraBold,
  Orbitron_900Black,
  useFonts,
} from '@expo-google-fonts/orbitron';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';
import { Colors, stackScreenOptions } from '@/constants/theme';
import { useT } from '@/i18n';
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

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const t = useT();
  const [fontsLoaded, fontError] = useFonts({
    Orbitron_500Medium,
    Orbitron_600SemiBold,
    Orbitron_700Bold,
    Orbitron_800ExtraBold,
    Orbitron_900Black,
    ChakraPetch_400Regular,
    ChakraPetch_500Medium,
    ChakraPetch_600SemiBold,
    ChakraPetch_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Keep the splash screen until the fonts are ready (falls back to system fonts on error).
  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      {isSupabaseConfigured ? (
        <AuthProvider>
          <Stack screenOptions={{ ...stackScreenOptions, headerBackTitle: t.common.back }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="join" options={{ title: t.nav.join }} />
            <Stack.Screen name="login" options={{ title: t.nav.quizmaster }} />
            <Stack.Screen
              name="play/[sessionId]"
              options={{
                title: 'QUIZARD',
                headerBackVisible: false,
                headerTitleStyle: { ...stackScreenOptions.headerTitleStyle, color: Colors.primary, fontSize: 18 },
              }}
            />
            <Stack.Screen name="host" options={{ headerShown: false }} />
            <Stack.Screen name="tv/index" options={{ title: t.nav.bigScreen }} />
            <Stack.Screen name="tv/[sessionId]" options={{ headerShown: false }} />
          </Stack>
        </AuthProvider>
      ) : (
        <Screen centered>
          <ThemedText type="subtitle">{t.setup.title}</ThemedText>
          <ThemedText>{t.setup.body}</ThemedText>
        </Screen>
      )}
    </ThemeProvider>
  );
}
