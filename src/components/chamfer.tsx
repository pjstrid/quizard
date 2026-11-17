import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';

type Corners = 'tl-br' | 'tr-bl' | 'all';

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Size of the cut corners in px. */
  cut?: number;
  /** Which corners are cut off. */
  corners?: Corners;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Draws a short accent line along the top-left cut, like a HUD frame. */
  accent?: string;
  /** Soft colored glow around the shape (where the platform supports `filter`). */
  glow?: string;
};

function points(w: number, h: number, c: number, inset: number, corners: Corners) {
  const [l, t, r, b] = [inset, inset, w - inset, h - inset];
  const p = (x: number, y: number) => `${x},${y}`;
  switch (corners) {
    case 'all':
      return [p(l + c, t), p(r - c, t), p(r, t + c), p(r, b - c), p(r - c, b), p(l + c, b), p(l, b - c), p(l, t + c)];
    case 'tr-bl':
      return [p(l, t), p(r - c, t), p(r, t + c), p(r, b), p(l + c, b), p(l, b - c)];
    default:
      return [p(l + c, t), p(r, t), p(r, b - c), p(r - c, b), p(l, b), p(l, t + c)];
  }
}

/**
 * A box with cut ("chamfered") corners – the angular, futuristic shape used
 * for buttons, cards and answer options (#12). The shape is drawn with SVG
 * behind the children, so it works the same on iOS, Android and web.
 */
export function Chamfer({
  children,
  style,
  cut = 12,
  corners = 'tl-br',
  fill = 'transparent',
  stroke,
  strokeWidth = 1.5,
  accent,
  glow,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  }

  const inset = stroke ? strokeWidth / 2 : 0;
  const c = Math.min(cut, size.h / 3, size.w / 3);

  return (
    // Until the size is known (first frame), fall back to a plain filled box so nothing flashes empty.
    <View style={[style, size.w === 0 && fill !== 'transparent' && { backgroundColor: fill }]} onLayout={onLayout}>
      {size.w > 0 && (
        <Svg
          width={size.w}
          height={size.h}
          style={[StyleSheet.absoluteFill, glow ? { filter: `drop-shadow(0 0 10px ${glow})` } : null]}
          pointerEvents="none">
          <Polygon
            points={points(size.w, size.h, c, inset, corners).join(' ')}
            fill={fill}
            stroke={stroke ?? 'none'}
            strokeWidth={stroke ? strokeWidth : 0}
          />
          {accent && corners !== 'tr-bl' && (
            <Line x1={inset} y1={c + inset} x2={c + inset} y2={inset} stroke={accent} strokeWidth={3} strokeLinecap="square" />
          )}
        </Svg>
      )}
      {children}
    </View>
  );
}
