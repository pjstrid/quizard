import './install-local-storage';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = createClient(
  url || 'https://not-configured.supabase.co',
  key || 'not-configured',
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Only refresh the token while the app is in the foreground (native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Turns error codes from our Postgres functions into readable messages. */
export function friendlyError(error: { message: string } | null | undefined): string {
  const message = error?.message ?? '';
  const known: Record<string, string> = {
    session_not_found: 'Hittade inget quiz med den koden.',
    session_finished: 'Det quizet är redan avslutat.',
    team_name_taken: 'Lagnamnet är redan taget. Välj ett annat.',
    invalid_team_name: 'Lagnamnet måste vara 1–40 tecken.',
    host_cannot_join: 'Du är quizmaster för det här quizet och kan inte gå med som lag.',
    not_authenticated: 'Du är inte inloggad.',
    'Invalid login credentials': 'Fel e-post eller lösenord.',
    'Anonymous sign-ins are disabled':
      'Anonym inloggning är avstängd i Supabase. Slå på den under Authentication → Sign In / Providers.',
  };
  for (const [code, text] of Object.entries(known)) {
    if (message.includes(code)) return text;
  }
  return message || 'Något gick fel.';
}
