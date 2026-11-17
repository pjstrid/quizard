import '@/global.css';

import { Platform } from 'react-native';

/**
 * QUIZARD theme – dark, high contrast, readable on a TV across the room (#12).
 * Contrast ratios (WCAG) are noted next to the pairs they are used in.
 *
 * - Yellow (`primary`) is for interaction and highlights: the primary button,
 *   the selected answer, logo, join code, timer and points. Use it sparingly.
 * - Answer options are light grey with near-black text.
 * - Right/wrong is always shown with an icon (✓ / ✗) as well as color.
 */
export const Colors = {
  background: '#1E2022', // base
  backgroundElement: '#2A2D31', // cards
  backgroundSelected: '#34383D',
  border: '#43484E',
  text: '#FFFFFF', // 16.3 on background
  textSecondary: '#B4BBC2', // 8.4 on background, 7.1 on cards

  primary: '#FFD200', // yellow, 11.3 on background
  onPrimary: '#111111', // 13.0 on yellow

  answer: '#E0E4E8', // answer options
  onAnswer: '#111111', // 14.8 on answer

  success: '#2ECC71', // 7.8 as text on background
  onSuccess: '#111111', // 9.0 on green (white would only be 2.1)

  danger: '#FF7A70', // red for text/borders, 6.4 on background
  dangerFill: '#E74C3C', // filled "wrong" state
  onDanger: '#111111', // 4.9 on dangerFill (white would only be 3.8)
} as const;

export type ThemeColor = keyof typeof Colors;

/**
 * Fonts (#12): Orbitron – wide and angular – for the logo, headings, codes,
 * numbers and small uppercase labels; Chakra Petch – angular but very
 * readable – for everything else. Loaded in src/app/_layout.tsx.
 *
 * Custom fonts on native need one family per weight, so pick the family with
 * fontFamilyFor() instead of setting fontWeight.
 */
export const FontFamily = {
  display: { 500: 'Orbitron_500Medium', 600: 'Orbitron_600SemiBold', 700: 'Orbitron_700Bold', 800: 'Orbitron_800ExtraBold', 900: 'Orbitron_900Black' },
  body: { 400: 'ChakraPetch_400Regular', 500: 'ChakraPetch_500Medium', 600: 'ChakraPetch_600SemiBold', 700: 'ChakraPetch_700Bold' },
} as const;

export type FontKind = keyof typeof FontFamily;

export function fontFamilyFor(kind: FontKind, weight: number | string | undefined) {
  const families = FontFamily[kind] as Record<number, string>;
  const available = Object.keys(families).map(Number);
  const wanted = Number(weight) || (kind === 'display' ? 700 : 500);
  // Closest available weight (the body font stops at 700).
  const best = available.reduce((a, b) => (Math.abs(b - wanted) < Math.abs(a - wanted) ? b : a));
  return families[best];
}

export const Fonts = { mono: Platform.select({ ios: 'ui-monospace', web: 'var(--font-mono)', default: 'monospace' }) };

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;


/**
 * Header style for every stack: Orbitron title, yellow back button.
 * Screens are portrait; only the big screen turns to landscape (#8).
 */
export const stackScreenOptions = {
  orientation: 'portrait' as const,
  headerTintColor: Colors.primary,
  headerShadowVisible: false,
  headerStyle: { backgroundColor: Colors.background },
  headerTitleStyle: { fontFamily: FontFamily.display[700], fontSize: 16, color: Colors.text },
  headerBackTitleStyle: { fontFamily: FontFamily.body[600] },
  contentStyle: { backgroundColor: Colors.background },
};
