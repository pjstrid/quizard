import { View } from 'react-native';

import { TeamMarker } from '@/components/team-marker';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import type { Team } from '@/lib/types';

export function TeamList({ teams, large }: { teams: Team[]; large?: boolean }) {
  return (
    <Card>
      <ThemedText type="label">
        LAG ({teams.length})
      </ThemedText>
      {teams.length === 0 && <ThemedText themeColor="textSecondary">Inga lag ännu …</ThemedText>}
      {teams.map((team) => (
        <View key={team.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TeamMarker color={team.color} size={large ? 24 : 16} />
          <ThemedText type={large ? 'subtitle' : 'default'}>{team.name}</ThemedText>
        </View>
      ))}
    </Card>
  );
}
