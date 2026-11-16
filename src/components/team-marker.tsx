import { View } from 'react-native';

/** A team's color as a small diamond – the angular counterpart to a dot (#12). */
export function TeamMarker({ color, size = 14 }: { color: string; size?: number }) {
  const side = size / Math.SQRT2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: side, height: side, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}
