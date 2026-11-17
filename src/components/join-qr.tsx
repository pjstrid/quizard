import * as Linking from 'expo-linking';
import QRCode from 'qrcode';
import { useMemo } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Chamfer } from '@/components/chamfer';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

/**
 * Where a phone should go to join with a code:
 * - web: this site's /join page
 * - app with EXPO_PUBLIC_WEB_URL: the public web address
 * - otherwise: a link into the app itself (works with Expo Go during development)
 */
export function joinUrl(code: string) {
  const base = Platform.OS === 'web' ? window.location.origin : process.env.EXPO_PUBLIC_WEB_URL;
  if (base) return `${base.replace(/\/$/, '')}/join?code=${code}`;
  return Linking.createURL('/join', { queryParams: { code } });
}

/** QR code that opens the join page with the code filled in. */
export function JoinQr({ code, size = 200 }: { code: string; size?: number }) {
  const theme = useTheme();
  const t = useT();
  const url = joinUrl(code);

  // One SVG path for all dark modules keeps it light even for large codes.
  const { path, count } = useMemo(() => {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (qr.modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { path: d, count: n };
  }, [url]);

  const quiet = 2; // light margin around the code so cameras find it
  const box = count + quiet * 2;

  return (
    <Chamfer
      style={{ padding: 10, alignSelf: 'center' }}
      cut={14}
      fill={theme.answer}
      stroke={theme.primary}
      strokeWidth={3}
      glow="rgba(255, 210, 0, 0.3)">
      <View accessible accessibilityRole="image" accessibilityLabel={t.tv.qrLabel(code)}>
        <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
          <Rect width={box} height={box} fill={theme.answer} />
          <Path d={path} fill={theme.onAnswer} transform={`translate(${quiet} ${quiet})`} />
        </Svg>
      </View>
    </Chamfer>
  );
}
