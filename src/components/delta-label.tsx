import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Space, Type, usePalette } from '@/lib/design';

/**
 * A change since last time: an arrow plus the magnitude.
 *
 * The colour rule lives here. For token usage, DOWN is the improvement — using
 * less of a budget is the good direction — which is the opposite of the usual
 * "up is good" convention, so `invert` is not a styling knob but a statement
 * about what the metric means. Anything flat is gray, and there is deliberately
 * no red: a heavier week is information, not an error.
 */
export interface DeltaLabelProps {
  /** Signed change. 0 renders flat unless `hideZero`. */
  delta: number;
  /** Text after the number, e.g. "vs last week". */
  suffix?: string;
  /** Formats the magnitude; defaults to a rounded absolute number. */
  format?: (abs: number) => string;
  fontSize?: number;
  hideZero?: boolean;
  /** true when a NEGATIVE delta is the improvement (budget consumption). */
  invert?: boolean;
  color?: string;
}

/** Chunky arrow, traced so it still reads at 11px where a stroke icon smears. */
function Arrow({ color, down, size }: { color: string; down: boolean; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Path
        d={
          down
            ? 'M6 10 L2 5 L4.5 5 L4.5 2 L7.5 2 L7.5 5 L10 5 Z'
            : 'M6 2 L10 7 L7.5 7 L7.5 10 L4.5 10 L4.5 7 L2 7 Z'
        }
        fill={color}
      />
    </Svg>
  );
}

export function DeltaLabel({
  delta,
  suffix,
  format,
  fontSize = Type.caption,
  hideZero = false,
  invert = false,
  color,
}: DeltaLabelProps) {
  const p = usePalette();
  if (delta === 0 && hideZero) return null;

  const rising = delta > 0;
  const improving = invert ? !rising : rising;
  const tone = color ?? (improving && delta !== 0 ? p.positive : p.textFaint);
  const magnitude = format ? format(Math.abs(delta)) : `${Math.round(Math.abs(delta))}`;

  return (
    <View style={styles.row}>
      <Arrow color={tone} down={!rising} size={Math.round(fontSize * 0.92)} />
      <Text style={[styles.label, { color: tone, fontSize }]}>
        {magnitude}
        {suffix ? ` ${suffix}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  label: { fontWeight: '700', fontVariant: ['tabular-nums'] },
});
