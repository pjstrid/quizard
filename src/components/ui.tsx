import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

import { Chamfer } from '@/components/chamfer';
import { ThemedText } from '@/components/themed-text';
import { FontFamily, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A faint technical grid behind every screen. */
export function GridBackground() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="grid" width={32} height={32} patternUnits="userSpaceOnUse">
          <Path d="M 32 0 L 0 0 0 32" fill="none" stroke="#FFFFFF" strokeOpacity={0.045} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#grid)" />
    </Svg>
  );
}

/** Page wrapper: safe area, scroll, centered max width. */
export function Screen({ children, centered }: PropsWithChildren<{ centered?: boolean }>) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <GridBackground />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, centered && { flexGrow: 1, justifyContent: 'center' }]}>
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  /** Screen reader label when the title is a symbol (e.g. ↑). */
  accessibilityLabel?: string;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, accessibilityLabel }: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const inactive = disabled || loading;
  const color =
    variant === 'danger' ? theme.danger : isPrimary ? (inactive ? theme.textSecondary : theme.onPrimary) : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [inactive && !isPrimary && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }]}>
      {({ pressed }) => (
        <Chamfer
          style={styles.button}
          cut={12}
          // A dimmed yellow looks muddy on dark grey, so inactive primary buttons turn grey.
          fill={isPrimary ? (inactive ? theme.backgroundSelected : theme.primary) : pressed ? theme.backgroundSelected : 'transparent'}
          stroke={isPrimary ? undefined : variant === 'danger' ? theme.danger : theme.border}
          glow={isPrimary && !inactive ? 'rgba(255, 210, 0, 0.35)' : undefined}>
          {loading ? (
            <ActivityIndicator color={color} />
          ) : (
            <ThemedText display style={[styles.buttonText, { color }]}>
              {title}
            </ThemedText>
          )}
        </Chamfer>
      )}
    </Pressable>
  );
}

/**
 * A button that asks for a second press before running a destructive action.
 * Works the same on web and native (no system dialog).
 */
export function ConfirmButton({
  title,
  confirmTitle = 'Säker? Tryck igen',
  onConfirm,
  loading,
  disabled,
}: {
  title: string;
  confirmTitle?: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function press() {
    if (armed) {
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 4000);
  }

  return (
    <Button title={armed ? confirmTitle : title} variant="danger" onPress={press} loading={loading} disabled={disabled} />
  );
}

export function TextField({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="label">{label}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        {...props}
        style={[
          styles.input,
          // Inputs sit on cards, so they use the darker base color.
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
          props.style,
        ]}
      />
    </View>
  );
}

/** Content panel with angular corners. `highlight` adds a yellow accent on the cut corner. */
export function Card({ children, highlight }: { children: ReactNode; highlight?: boolean }) {
  const theme = useTheme();
  return (
    <Chamfer
      style={styles.card}
      cut={16}
      fill={theme.backgroundElement}
      stroke={highlight ? theme.primary : theme.border}
      strokeWidth={highlight ? 1.5 : 1}
      accent={theme.primary}>
      {children}
    </Chamfer>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const theme = useTheme();
  if (!children) return null;
  return <ThemedText style={{ color: theme.danger }}>{children}</ThemedText>;
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.four, alignItems: 'center' },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  button: {
    minHeight: 54,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center' },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    fontFamily: FontFamily.body[600],
  },
  card: { padding: Spacing.three + 2, gap: Spacing.two },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
