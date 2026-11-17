import { StyleSheet } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Chamfer } from '@/components/chamfer';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

/**
 * The winner(s) at the end of a quiz, in a glowing yellow frame. Drawn with
 * our own shapes instead of a trophy emoji, which not every device renders.
 */
export function WinnerBanner({ names, large }: { names: string[]; large?: boolean }) {
  const theme = useTheme();
  const t = useT();
  const size = large ? 48 : 24;
  return (
    <Animated.View entering={ZoomIn.springify().damping(10)} style={{ alignSelf: 'center' }}>
      <Chamfer
        style={[styles.box, large && styles.boxLarge]}
        cut={large ? 20 : 12}
        fill={theme.backgroundElement}
        stroke={theme.primary}
        strokeWidth={2}
        accent={theme.primary}
        glow="rgba(255, 210, 0, 0.35)">
        <ThemedText type="label" style={[styles.center, { color: theme.primary }, large && { fontSize: 20, lineHeight: 26 }]}>
          {t.host.winner(names.length)}
        </ThemedText>
        <ThemedText display style={[styles.center, { fontSize: size, lineHeight: size * 1.25, fontWeight: 800 }]}>
          {t.common.winners(names)}
        </ThemedText>
      </Chamfer>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, gap: Spacing.one, minWidth: 220 },
  boxLarge: { paddingHorizontal: Spacing.five, paddingVertical: Spacing.four, gap: Spacing.two, minWidth: 420 },
  center: { textAlign: 'center' },
});
