import { barY } from '@tanstack/charts/bar';
import { crosshair } from '@tanstack/charts/crosshair';
import { createChartCursor, cursorHost } from '@tanstack/charts/cursor';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react-native';
import { ruleY } from '@tanstack/charts/rule';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { defineChart } from '@tanstack/charts/scene';
import { text } from '@tanstack/charts/text';
import type { ChartPoint } from '@tanstack/charts/types';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { useChartScrub, useScrubKey } from '@/hooks/use-chart-scrub';
import { Radius, Type, usePalette, withAlpha } from '@/lib/design';
import { formatTokens } from '@/lib/format';

const CHART_HEIGHT = 148;

export interface DayPoint {
  key: string;
  label: string;
  detail: string;
  tokens: number;
  opus: number;
  sonnet: number;
  other: number;
  unattributed: number;
  /** false = we weren't observing. Renders as a ghost, never as a zero. */
  hasCoverage: boolean;
  coverage: number;
  isCurrent: boolean;
}

export interface DailyTokensChartProps {
  points: readonly DayPoint[];
  /** Tokens/day that would exactly exhaust the weekly limit. null hides the line. */
  pace?: number | null;
  onScrub?: (point: DayPoint | null) => void;
}

/**
 * Tokens consumed per day.
 *
 * Bars, not a line: these are discrete independent buckets and height
 * comparison is the task. A line would interpolate across days you didn't work
 * and would make a no-coverage day indistinguishable from a zero day.
 *
 * Three visually distinct states, because "I did nothing" and "we weren't
 * watching" both come out of a naive query as 0, and rendering them identically
 * is the most common way this class of chart lies:
 *   value       — a real measured amount
 *   true zero   — full coverage, no usage: a baseline stub
 *   no coverage — a hollow ghost at a fixed token height
 */
export function DailyTokensChart({ points, pace, onScrub }: DailyTokensChartProps) {
  const p = usePalette();

  // Stable across definition rebuilds: <Chart> re-binds its cursor session
  // whenever the controller identity changes, which would drop a live scrub.
  const cursor = useMemo(() => createChartCursor<string, number>(), []);
  const scrubbedKey = useScrubKey();

  const maxTokens = useMemo(
    () => Math.max(1, ...points.map((d) => d.tokens), pace ?? 0),
    [points, pace],
  );

  const definition = useMemo(() => {
    const keys = points.map((d) => d.key);
    const labels = new Map(points.map((d) => [d.key, d.label]));
    // A ghost still needs a visible height, and a true zero needs a stub that
    // reads as "measured, and it was nothing".
    const ghostHeight = maxTokens * 0.06;
    const zeroStub = maxTokens * 0.012;

    const height = (d: DayPoint): number => {
      if (!d.hasCoverage) return ghostHeight;
      return d.tokens > 0 ? d.tokens : zeroStub;
    };

    const fill = (d: DayPoint): string => {
      if (!d.hasCoverage) return p.barGhost;
      if (d.tokens === 0) return p.barEmpty;
      const ink = d.isCurrent ? p.accent : p.bar;
      // Partial coverage fades the bar. Per-datum opacity is not a channel, so
      // the alpha rides on the colour itself.
      return d.coverage < 0.5 ? withAlpha(ink, 0.45) : ink;
    };

    return defineChart({
      marks: [
        // ONE bar mark for every bucket: the band domain is inferred from mark
        // data in first-seen order, so splitting states into separate marks
        // silently reorders the bars.
        barY(points as DayPoint[], {
          x: 'key',
          y1: 0,
          y2: height,
          key: 'key',
          radius: Radius.xs,
          fill,
        }),
        // Overlay AFTER the bars — they paint opaque, so a band behind them
        // would only show in the sliver above each bar's top edge.
        crosshair<string, number>({
          x: { band: { inset: 0, radius: Radius.xs, fill: p.text, fillOpacity: 0.12 } },
          y: false,
        }),
        ...(pace != null && pace > 0
          ? [
              decorative(
                ruleY([pace], {
                  stroke: p.textFaint,
                  strokeOpacity: 0.45,
                  strokeWidth: 1.5,
                  strokeDasharray: '4 4',
                }),
              ),
              decorative(
                text([pace], {
                  x: () => keys[0],
                  y: (v: number) => v,
                  text: (v: number) => `pace ${formatTokens(v)}`,
                  fill: p.textFaint,
                  fontSize: Type.micro,
                  anchor: 'start',
                  dy: -6,
                }),
              ),
            ]
          : []),
      ],
      scales: {
        x: {
          scale: () => scaleBand<string>().domain(keys).paddingInner(0.28).paddingOuter(0),
          axis: {
            line: false,
            ticks: { values: keys, size: 0, format: (k: string) => labels.get(k) ?? '' },
            tickLabels: { fontSize: Type.micro },
          },
        },
        y: { scale: () => scaleLinear().domain([0, maxTokens * 1.08]), grid: false, axis: false },
      },
      focus: 'nearest-x',
      // The pan owns the scrub, so the host must not claim touches. Keyboard
      // and accessibility navigation are unaffected.
      pointer: false,
      // The cursor band IS the focus indicator; the host ring would double it.
      focusRing: false,
      cursor: { use: cursorHost, controller: cursor, mode: 'focus', match: 'x' },
      theme: { foreground: p.text, muted: p.textFaint, grid: p.grid, background: 'transparent' },
    });
  }, [points, pace, maxTokens, p, cursor]);

  const handleFocus = useCallback(
    (focused: ChartPoint<DayPoint, string, number> | null) => {
      const point = focused?.datum ?? null;
      const key = point?.key ?? null;
      if (key === scrubbedKey.current) return;
      scrubbedKey.current = key;
      // One tick per bucket crossed — the same feedback a picker gives, because
      // this is the same kind of discrete selection.
      if (key != null) Haptics.selectionAsync();
      onScrub?.(point);
    },
    [onScrub, scrubbedKey],
  );

  const focusIndex = useCallback(
    (index: number) => {
      const point = points[index];
      if (!point) return;
      // A semantic value, not a coordinate: the host maps the key back through
      // its own scales to a point, a focus group, and the band.
      cursor.setState({ anchor: 'value', value: { x: point.key }, source: 'pointer', pinned: false });
    },
    [cursor, points],
  );

  const endScrub = useCallback(() => {
    cursor.setState(null);
    if (scrubbedKey.current == null) return;
    scrubbedKey.current = null;
    onScrub?.(null);
  }, [cursor, onScrub, scrubbedKey]);

  const { gesture, onRender, onLayout } = useChartScrub(points, focusIndex, endScrub);

  // A range switch replaces every bucket; a scrub held across it would report a
  // bar that no longer exists.
  useEffect(() => endScrub(), [points, endScrub]);

  if (points.length === 0) return null;

  return (
    <GestureDetector gesture={gesture}>
      <View onLayout={onLayout}>
        <Chart
          definition={definition}
          height={CHART_HEIGHT}
          color={p.text}
          accessibilityLabel="Tokens used per day"
          accessibilityHint="Swipe across to inspect a day. Its details read out above the chart."
          testID="daily-tokens-chart"
          onFocusChange={handleFocus}
          onRender={onRender}
        />
      </View>
    </GestureDetector>
  );
}
