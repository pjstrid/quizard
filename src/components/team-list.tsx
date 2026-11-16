import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import type { Team } from '@/lib/types';

export function TeamList({ teams, large }: { teams: Team[]; large?: boolean }) {
  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        LAG ({teams.length})
      </ThemedText>
      {teams.length === 0 && <ThemedText themeColor="textSecondary">Inga lag ännu …</ThemedText>}
      {teams.map((team) => (
        <View key={team.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: large ? 22 : 14,
              height: large ? 22 : 14,
              borderRadius: 11,
              backgroundColor: team.color,
            }}
          />
          <ThemedText type={large ? 'subtitle' : 'default'}>{team.name}</ThemedText>
        </View>
      ))}
    </Card>
  );
}
