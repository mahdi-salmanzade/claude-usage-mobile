import { StyleSheet, Text, View } from 'react-native';

import { Space, Type, usePalette } from '@/lib/design';
import { formatClock, formatDuration, formatPercent, formatRate, shortAgo } from '@/lib/format';
import type { LiveMetrics } from '@/hooks/use-analytics';

/**
 * Where the current window lands, in one line.
 *
 * The percentage leads because it is defined in every non-degenerate case and
 * bounded 0-100; a clock time only exists in the one case where you actually
 * run out. Each state says what it knows and, when it knows nothing, says that
 * instead of guessing.
 */
export function ProjectionLine({ metrics, now }: { metrics: LiveMetrics | null; now: number }) {
  const p = usePalette();
  if (!metrics) return null;

  const { session, capRange, burnDisplay, macStale, lastObservedAt } = metrics;

  // A stale Mac looks exactly like an idle user. Saying "you'll make it"
  // because the Mac stopped reporting is a lie in the dangerous direction.
  if (macStale) {
    return (
      <Line color={p.textFaint}>
        {lastObservedAt
          ? `Last known — your Mac refreshed ${shortAgo(now - lastObservedAt)}`
          : 'Waiting for your Mac to refresh'}
      </Line>
    );
  }

  switch (session.kind) {
    case 'unknown':
      return (
        <Line color={p.textFaint}>
          {session.reason === 'no-limit'
            ? 'No session limit reported'
            : 'Collecting usage — projections start after a few minutes'}
        </Line>
      );
    case 'at-cap':
      return <Line color={p.critical}>Session cap reached</Line>;
    case 'imminent':
      return <Line color={p.critical}>Hitting the session cap any moment now</Line>;
    case 'idle':
      return (
        <Line color={p.safe}>
          {`Idle — on track for ${formatPercent(session.projectedPct)} at reset`}
        </Line>
      );
    case 'safe':
      return (
        <Line color={p.safe}>
          {`On track for ${formatPercent(session.projectedPct)} at reset`}
          {burnDisplay != null && burnDisplay > 0 ? (
            <Text style={{ color: p.textFaint }}>{`  ·  ${formatRate(burnDisplay)}`}</Text>
          ) : null}
        </Line>
      );
    case 'cap-before-reset':
      return (
        <View style={styles.stack}>
          <Line color={p.critical}>
            {capRange
              ? `Cap between ${formatClock(capRange[0])} and ${formatClock(capRange[1])}`
              : `Cap at ${formatClock(session.capAt)}`}
          </Line>
          <Text style={[styles.sub, { color: p.textSecondary }]}>
            {`${formatDuration(session.lockoutMs)} before the window resets`}
            {burnDisplay != null ? `  ·  ${formatRate(burnDisplay)}` : ''}
          </Text>
        </View>
      );
  }
}

function Line({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <Text style={[styles.line, { color }]} accessibilityRole="text">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center', gap: 2 },
  line: { fontSize: Type.body, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: Type.caption, textAlign: 'center', marginTop: Space.xs - 2 },
});
