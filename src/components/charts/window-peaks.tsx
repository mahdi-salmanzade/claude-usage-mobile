import { StyleSheet, Text, View } from 'react-native';

import { Space, Type, statusFor, usePalette } from '@/lib/design';
import { formatPercent } from '@/lib/format';
import type { WindowRow } from '@/lib/history';

/**
 * How full each of the last N session windows got.
 *
 * A per-window strip rather than a time series, because the session counter
 * resets every ~5 hours — plotting it continuously produces a sawtooth that
 * reads as data loss. "You maxed out 4 of your last 10 sessions" is the honest
 * form of the same question.
 */
export function WindowPeaks({ windows }: { windows: readonly WindowRow[] }) {
  const p = usePalette();
  if (windows.length === 0) return null;

  // Oldest first, so the strip reads left-to-right like every other chart here.
  const ordered = [...windows].reverse();
  const maxed = ordered.filter((w) => w.peak_pct >= 99).length;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {ordered.map((w) => {
          const pct = Math.max(0, Math.min(100, w.peak_pct));
          return (
            <View key={`${w.reset_at}`} style={styles.cell}>
              <View style={[styles.track, { backgroundColor: p.track }]}>
                <View
                  style={{
                    height: `${pct}%`,
                    backgroundColor: statusFor(pct, p),
                    borderRadius: 3,
                  }}
                />
              </View>
              <Text style={[styles.tick, { color: p.textFaint }]}>{Math.round(pct)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={[styles.caption, { color: p.textFaint }]}>
        {maxed > 0
          ? `Peak usage per session window. You reached the cap in ${maxed} of the last ${ordered.length}.`
          : `Peak usage per session window. Highest was ${formatPercent(
              Math.max(...ordered.map((w) => w.peak_pct)),
            )}.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.xs + 2, height: 78 },
  cell: { flex: 1, alignItems: 'center', gap: Space.xs },
  track: { width: '100%', flex: 1, borderRadius: 3, justifyContent: 'flex-end', overflow: 'hidden' },
  tick: { fontSize: 9, fontVariant: ['tabular-nums'] },
  caption: { fontSize: Type.micro, lineHeight: 15 },
});
