import { View } from 'react-native';

import { TeamMarker } from '@/components/team-marker';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ScoreRow } from '@/lib/types';

type Props = {
  rows: ScoreRow[];
  title?: string;
  /** Highlights this team (the team's own phone). */
  highlightTeamId?: string;
};

export function Scoreboard({ rows, title = 'STÄLLNING', highlightTeamId }: Props) {
  const theme = useTheme();

  return (
    <Card>
      <ThemedText type="label">
        {title}
      </ThemedText>
      {rows.map((row, i) => {
        // Teams with the same score share a placement.
        const place = rows.findIndex((r) => r.score === row.score) + 1;
        const mine = row.team_id === highlightTeamId;
        return (
          <View
            key={row.team_id}
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
          </View>
        );
      })}
      {rows.length === 0 && <ThemedText themeColor="textSecondary">Inga lag.</ThemedText>}
    </Card>
  );
}
