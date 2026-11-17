import '@/lib/install-local-storage';

import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import { en } from '@/i18n/en';
import { sv, type Strings } from '@/i18n/sv';

/**
 * A small translation layer (#7): one typed dictionary per language, so a
 * missing key is a type error. Swedish is the source of truth (sv.ts).
 *
 * To add a language: create xx.ts typed as `Strings`, add it to `dictionaries`
 * and to `LANGUAGES`.
 */
const dictionaries = { sv, en } satisfies Record<string, Strings>;

export type Language = keyof typeof dictionaries;
export type { Strings };

/** Languages offered in the picker, with their own names. */
export const LANGUAGES: { code: Language; name: string }[] = [
  { code: 'sv', name: 'Svenska' },
  { code: 'en', name: 'English' },
];

const STORAGE_KEY = 'quizard.language';

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && value in dictionaries;
}

/** A choice saved on this device wins; otherwise the device language; otherwise English. */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to the device language.
  }
  for (const locale of getLocales()) {
    if (isLanguage(locale.languageCode)) return locale.languageCode;
  }
  return 'en';
}

let current: Language = initialLanguage();
const listeners = new Set<() => void>();

export function getLanguage() {
  return current;
}

export function setLanguage(language: Language) {
  if (language === current) return;
  current = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not saved – the choice still applies until the app restarts.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current language; components re-render when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

/** Strings for the current language. Use this in components. */
export function useT(): Strings {
  return dictionaries[useLanguage()];
}

/**
 * Strings for the current language outside React (e.g. in event handlers).
 * Prefer `useT()` while rendering, so the screen updates when the language changes.
 */
export function strings(): Strings {
  return dictionaries[current];
}
