import { StyleSheet, Text, View } from 'react-native';

import { Radius, Space, Type, usePalette } from '@/lib/design';
import { formatPercent, formatTokens } from '@/lib/format';

export interface SplitSegment {
  label: string;
  tokens: number;
  color: string;
}

/**
 * One normalised bar for the current week's model split.
 *
 * Normalising is safe HERE and only here: there is a single total, so the
 * proportions are the whole question. It reuses the same bar language as the
 * weekly meters above it so the two read as one system rather than as a chart
 * dropped into a card.
 */
export function SplitBar({ segments, height = 10 }: { segments: readonly SplitSegment[]; height?: number }) {
  const p = usePalette();
  const total = segments.reduce((s, x) => s + Math.max(0, x.tokens), 0);
  if (total <= 0) return null;

  const visible = segments.filter((s) => s.tokens / total >= 0.02);

  return (
    <View style={styles.wrap}>
      <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: p.track }]}>
        {segments.map((s) =>
          s.tokens <= 0 ? null : (
            <View
              key={s.label}
              style={{ flex: Math.max(0, s.tokens), backgroundColor: s.color }}
              accessibilityLabel={`${s.label} ${formatPercent((s.tokens / total) * 100)}`}
            />
          ),
        )}
      </View>
      <View style={styles.legend}>
        {visible.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={[styles.legendLabel, { color: p.textSecondary }]}>{s.label}</Text>
            <Text style={[styles.legendValue, { color: p.textFaint }]}>{formatTokens(s.tokens)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.md },
  track: { flexDirection: 'row', overflow: 'hidden', borderRadius: Radius.pill },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Space.xs + 2 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: { fontSize: Type.micro, fontWeight: '600' },
  legendValue: { fontSize: Type.micro, fontVariant: ['tabular-nums'] },
});
