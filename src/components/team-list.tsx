import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { TeamMarker } from '@/components/team-marker';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { useT } from '@/i18n';
import type { Team } from '@/lib/types';

export function TeamList({ teams, large }: { teams: Team[]; large?: boolean }) {
  const t = useT();
  return (
    <Card>
      <ThemedText type="label">
        {t.common.teams(teams.length)}
      </ThemedText>
      {teams.length === 0 && <ThemedText themeColor="textSecondary">{t.common.noTeamsYet}</ThemedText>}
      {teams.map((team) => (
        // New teams slide in as they join (#6).
        <Animated.View
          key={team.id}
          entering={FadeInDown.springify().damping(14)}
          layout={LinearTransition}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TeamMarker color={team.color} size={large ? 24 : 16} />
          <ThemedText type={large ? 'subtitle' : 'default'}>{team.name}</ThemedText>
        </Animated.View>
      ))}
    </Card>
  );
}
