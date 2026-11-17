import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { useState, type ReactNode } from 'react';
import { Platform, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

/** The big-screen layout is designed for this size and scaled to fit the actual screen. */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

/**
 * Scale factor for the big screen: 1 at 1280×720, larger on a 1080p TV
 * browser, smaller on a phone in landscape that is mirrored to a TV with
 * AirPlay (#8) – so the TV shows the same layout either way.
 */
export function useTvScale() {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(1.5, Math.max(0.45, Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT)));
  return { scale, width: width / scale, height: height / scale };
}

/**
 * Root of the big-screen view. Lays the content out at the design size and
 * scales it to the window, keeps the device awake (a mirroring phone must
 * not lock mid-quiz) and hides the status bar.
 */
export function TvCanvas({ children }: { children: (logicalWidth: number) => ReactNode }) {
  useKeepAwake();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { scale, width, height } = useTvScale();
  const [contentHeight, setContentHeight] = useState(0);

  // In landscape the Dynamic Island / notch sits on a side.
  const sidePadding = Math.max(insets.left, insets.right) / scale;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ height: Math.max(contentHeight * scale, height * scale) }}>
      {Platform.OS !== 'web' && <StatusBar hidden />}
      <View
        // Layout happens before the transform, so this is the unscaled height.
        onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
        style={{
          width,
          minHeight: height,
          paddingHorizontal: sidePadding,
          transform: [{ scale }],
          transformOrigin: 'top left',
        }}>
        {children(width - sidePadding * 2)}
      </View>
    </ScrollView>
  );
}
