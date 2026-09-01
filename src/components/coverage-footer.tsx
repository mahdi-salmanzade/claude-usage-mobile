import { StyleSheet, Text, View } from 'react-native';

import { Space, Type, usePalette } from '@/lib/design';
import { formatTokens, shortAgo } from '@/lib/format';
import type { Coverage } from '@/lib/history';

/**
 * What the charts above are and are not based on.
 *
 * Not optional decoration. History accumulates only while the phone is
 * watching, so a chart drawn from 40% coverage looks exactly like one drawn
 * from 100% — this footer is the difference between an honest chart and a
 * confident lie.
 */
export function CoverageFooter({
  coverage,
  now,
  timezone,
  deviceTimezone,
}: {
  coverage: Coverage;
  now: number;
  /** The Mac's zone: the one days are grouped by. */
  timezone?: string;
  deviceTimezone?: string;
}) {
  const p = usePalette();
  const pct = Math.round(coverage.fraction * 100);
  const zonesDiffer = !!timezone && !!deviceTimezone && timezone !== deviceTimezone;

  const bits: string[] = [`${pct}% observed`, `${coverage.sampleCount} snapshots`];
  if (coverage.gapCount > 0) {
    bits.push(`${coverage.gapCount} gap${coverage.gapCount === 1 ? '' : 's'}`);
  }
  if (coverage.unattributedTokens > 0) {
    bits.push(`${formatTokens(coverage.unattributedTokens)} unattributed`);
  }
  if (coverage.lastAt) bits.push(`last ${shortAgo(now - coverage.lastAt)}`);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.line, { color: p.textFaint }]}>{bits.join('  ·  ')}</Text>
      {coverage.unattributedTokens > 0 && (
        <Text style={[styles.line, { color: p.textFaint }]}>
          Unattributed tokens were used while the app wasn&apos;t watching. They count toward your
          week but can&apos;t be placed on a day.
        </Text>
      )}
      {zonesDiffer && (
        <Text style={[styles.line, { color: p.textFaint }]}>
          Days are grouped by your Mac&apos;s time ({timezone}).
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.xs, paddingHorizontal: Space.xs },
  line: { fontSize: Type.micro, lineHeight: 16 },
});
