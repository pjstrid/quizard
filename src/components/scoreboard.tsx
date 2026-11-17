import Animated, { LinearTransition, ZoomIn } from 'react-native-reanimated';

import { TeamMarker } from '@/components/team-marker';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import type { ScoreRow } from '@/lib/types';

type Props = {
  rows: ScoreRow[];
  title?: string;
  /** Highlights this team (the team's own phone). */
  highlightTeamId?: string;
};

export function Scoreboard({ rows, title, highlightTeamId }: Props) {
  const t = useT();
  const theme = useTheme();

  return (
    <Card>
      <ThemedText type="label">
        {title ?? t.common.standings}
      </ThemedText>
      {rows.map((row, i) => {
        // Teams with the same score share a placement.
        const place = rows.findIndex((r) => r.score === row.score) + 1;
        const mine = row.team_id === highlightTeamId;
        return (
          // Rows glide to their new place when the order changes (#6).
          <Animated.View
            key={row.team_id}
            layout={LinearTransition.springify().damping(16)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: Spacing.two,
              paddingVertical: Spacing.one,
              borderTopWidth: i === 0 ? 0 : 1,
              borderColor: theme.border,
            }}>
            <ThemedText display style={{ width: 32, fontWeight: 700 }} themeColor="textSecondary">
              {String(place).padStart(2, '0')}
            </ThemedText>
            <TeamMarker color={row.color} />
            <ThemedText style={{ flex: 1, fontWeight: mine ? 700 : 500 }}>{row.name}</ThemedText>
            {/* The leader's score is the one yellow number on the board. */}
            <Animated.View key={row.score} entering={ZoomIn.springify().damping(10)}>
              <ThemedText
                display
                style={{
                  fontWeight: 900,
                  fontSize: 20,
                  fontVariant: ['tabular-nums'],
                  color: place === 1 && row.score > 0 ? theme.primary : theme.text,
                }}>
                {row.score}
              </ThemedText>
            </Animated.View>
          </Animated.View>
        );
      })}
      {rows.length === 0 && <ThemedText themeColor="textSecondary">Inga lag.</ThemedText>}
    </Card>
  );
}
