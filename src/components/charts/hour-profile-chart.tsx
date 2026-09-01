import { barY } from '@tanstack/charts/bar';
import { Chart } from '@tanstack/charts/react-native';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { defineChart } from '@tanstack/charts/scene';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Space, Type, usePalette, withAlpha } from '@/lib/design';
import type { HourBucket } from '@/lib/history';

const CHART_HEIGHT = 118;

/**
 * When during the day the tokens go.
 *
 * Plain vertical bars, deliberately not a radial clock face: area in a polar
 * bar scales as r², so a clock exaggerates large values quadratically. It
 * photographs beautifully and misrepresents the data by construction.
 *
 * The strip underneath is the confidence: an hour observed on one day and an
 * hour observed on ten are not the same claim, and the mean alone hides that.
 */
export function HourProfileChart({
  buckets,
  height = CHART_HEIGHT,
}: {
  buckets: readonly HourBucket[];
  height?: number;
}) {
  const p = usePalette();

  const maxDays = useMemo(() => Math.max(1, ...buckets.map((b) => b.coveredDays)), [buckets]);
  const rows = useMemo(
    () => buckets.map((b) => ({ ...b, key: String(b.hour), value: b.meanTokens ?? 0 })),
    [buckets],
  );
  const maxValue = useMemo(() => Math.max(1, ...rows.map((r) => r.value)), [rows]);

  const definition = useMemo(() => {
    const keys = rows.map((r) => r.key);
    return defineChart({
      marks: [
        barY(rows, {
          x: 'key',
          y1: 0,
          y2: (r: (typeof rows)[number]) => r.value,
          key: 'key',
          radius: 2,
          // Fade an hour in proportion to how many days actually covered it.
          fill: (r: (typeof rows)[number]) =>
            r.meanTokens == null
              ? p.barGhost
              : withAlpha(p.accent, 0.35 + 0.65 * (r.coveredDays / maxDays)),
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand<string>().domain(keys).paddingInner(0.3).paddingOuter(0),
          axis: {
            line: false,
            // Every third hour: 24 labels do not fit at this width.
            ticks: {
              values: keys,
              size: 0,
              format: (k: string) => (Number(k) % 6 === 0 ? `${k}` : ''),
            },
            tickLabels: { fontSize: Type.micro },
          },
        },
        y: { scale: () => scaleLinear().domain([0, maxValue * 1.08]), grid: false, axis: false },
      },
      focus: false,
      pointer: false,
      focusRing: false,
      theme: { foreground: p.text, muted: p.textFaint, grid: p.grid, background: 'transparent' },
    });
  }, [rows, maxValue, maxDays, p]);

  const anyData = rows.some((r) => r.meanTokens != null);
  if (!anyData) return null;

  return (
    <View>
      <Chart
        definition={definition}
        height={height}
        color={p.text}
        accessibilityLabel="Average tokens used by hour of day"
        testID="hour-profile-chart"
      />
      <View style={styles.coverage} accessibilityLabel="Days of coverage per hour">
        {rows.map((r) => (
          <View
            key={r.key}
            style={{
              flex: 1,
              height: 3,
              marginHorizontal: 0.5,
              borderRadius: 1.5,
              backgroundColor:
                r.coveredDays === 0 ? p.barGhost : withAlpha(p.textFaint, 0.3 + 0.7 * (r.coveredDays / maxDays)),
            }}
          />
        ))}
      </View>
      <Text style={[styles.caption, { color: p.textFaint }]}>
        Bar height is the average across days that hour was observed; the strip below is how many.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  coverage: { flexDirection: 'row', marginTop: Space.xs, borderRadius: Radius.xs },
  caption: { fontSize: Type.micro, lineHeight: 15, marginTop: Space.sm },
});
