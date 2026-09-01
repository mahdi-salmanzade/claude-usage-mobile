import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { usePalette } from '@/lib/design';

/**
 * A linear tick meter — the radial gauge's language flattened out, so a
 * secondary metric reads as the same system as the hero.
 *
 * Ticks are laid out with `space-between` rather than a fixed pitch so the bar
 * fills whatever width it is given.
 */
export interface TickBarProps {
  /** 0-1. Values outside the range are clamped. */
  fill: number;
  tickCount?: number;
  height?: number;
  tickWidth?: number;
  tick?: string;
  track?: string;
  style?: StyleProp<ViewStyle>;
}

export function TickBar({
  fill,
  tickCount = 32,
  height = 18,
  tickWidth = 3,
  tick,
  track,
  style,
}: TickBarProps) {
  const p = usePalette();
  const inked = Math.round(Math.max(0, Math.min(fill, 1)) * tickCount);

  return (
    <View style={[styles.bar, { height }, style]}>
      {Array.from({ length: tickCount }, (_, i) => (
        <View
          key={i}
          style={{
            width: tickWidth,
            height,
            borderRadius: tickWidth / 2,
            backgroundColor: i < inked ? (tick ?? p.text) : (track ?? p.track),
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
