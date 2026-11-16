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
    not_in_session: 'Ni är inte med i det här quizet.',
    not_session_host: 'Bara quizmastern kan göra det.',
    not_quiz_owner: 'Det här quizet är inte ditt.',
    quiz_in_play: 'Quizet spelas just nu. Avsluta spelet innan du ändrar frågorna.',
    no_questions: 'Lägg till minst en fråga innan du startar.',
    invalid_state: 'Det går inte just nu. Försök igen.',
    answers_closed: 'Svaren är stängda för den här frågan.',
    time_up: 'Tiden är ute!',
    already_locked: 'Ni har redan låst in ert svar.',
    invalid_answer: 'Ogiltigt svar.',
    invalid_options: 'Ange 3–4 svarsalternativ.',
    invalid_answer_key: 'Markera vilket alternativ som är rätt.',
    invalid_fields: 'Välj 1–4 svar per lag.',
    time_limit_required: 'En lista behöver en tidsgräns.',
    invalid_grading: 'Rättningen stämmer inte med svaret. Ladda om och försök igen.',
    not_manual_question: 'Den här frågan rättas automatiskt.',
    invalid_pick: 'Markera 2–3 rätta svar.',
    invalid_unit: 'Enheten får vara högst 20 tecken.',
    unsupported_question_type: 'Den frågetypen stöds inte än.',
    'Invalid login credentials': 'Fel e-post eller lösenord.',
    'Anonymous sign-ins are disabled':
      'Anonym inloggning är avstängd i Supabase. Slå på den under Authentication → Sign In / Providers.',
  };
  for (const [code, text] of Object.entries(known)) {
    if (message.includes(code)) return text;
  }
  return message || 'Något gick fel.';
}
