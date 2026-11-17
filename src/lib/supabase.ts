import './install-local-storage';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { strings } from '@/i18n';

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

/**
 * Turns error codes from our Postgres functions (and a few Supabase Auth
 * messages) into readable messages in the current language.
 */
export function friendlyError(error: { message: string } | null | undefined): string {
  const message = error?.message ?? '';
  const { fallback, ...known } = strings().errors;
  for (const [code, text] of Object.entries(known)) {
    if (message.includes(code)) return text;
  }
  return message || fallback;
}
