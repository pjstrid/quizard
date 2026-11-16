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

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

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
