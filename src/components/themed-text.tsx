import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Colors, fontFamilyFor, type FontKind, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'label' | 'link' | 'linkPrimary';
  themeColor?: ThemeColor;
  /** Use the display font (Orbitron) instead of the body font. Titles and labels default to it. */
  display?: boolean;
};

const DISPLAY_TYPES = new Set(['title', 'subtitle', 'label']);

export function ThemedText({ style, type = 'default', themeColor, display, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const flat = StyleSheet.flatten([styles[type], style]) as TextStyle;
  const kind: FontKind = display ?? DISPLAY_TYPES.has(type) ? 'display' : 'body';
  const defaultColor = type === 'label' ? theme.textSecondary : theme.text;

  return (
    <Text
      style={[
        { color: themeColor ? theme[themeColor] : defaultColor },
        flat,
        // Custom fonts pick the weight by family; a synthetic bold would look smeared.
        { fontFamily: fontFamilyFor(kind, flat.fontWeight), fontWeight: 'normal' },
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: 700 },
  default: { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  title: { fontSize: 44, lineHeight: 52, fontWeight: 900, letterSpacing: 3 },
  subtitle: { fontSize: 26, lineHeight: 34, fontWeight: 800, letterSpacing: 1 },
  /** Small uppercase section labels, e.g. "LÅSTA SVAR". */
  label: { fontSize: 12, lineHeight: 18, fontWeight: 600, letterSpacing: 1.8, textTransform: 'uppercase' },
  link: { lineHeight: 30, fontSize: 14 },
  linkPrimary: { lineHeight: 30, fontSize: 14, color: Colors.primary },
});
