import { barY } from '@tanstack/charts/bar';
import { Chart } from '@tanstack/charts/react-native';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { defineChart } from '@tanstack/charts/scene';
import { stack } from '@tanstack/charts/stack';
import { useMemo } from 'react';

import { Radius, Type, usePalette } from '@/lib/design';
import type { DayPoint } from './daily-tokens-chart';

const CHART_HEIGHT = 148;
/** Below this a split is noise — 100/0 off 300 tokens reads as a strong signal. */
export const MIN_SPLIT_TOKENS = 20_000;

export type ModelKey = 'Opus' | 'Sonnet' | 'Other';

/**
 * Which model the day's tokens went to, per day.
 *
 * ABSOLUTE stacked bars, not normalised: a 100%-stacked daily chart makes a
 * 5K-token day look exactly as important as a 500K one. The normalised view
 * belongs on the single current-week bar, where there is only one total.
 *
 * Days below `MIN_SPLIT_TOKENS` are dropped rather than drawn — their split is
 * dominated by rounding.
 */
export function ModelSplitChart({
  points,
  height = CHART_HEIGHT,
}: {
  points: readonly DayPoint[];
  height?: number;
}) {
  const p = usePalette();

  const rows = useMemo(
    () =>
      points
        .filter((d) => d.hasCoverage && d.tokens >= MIN_SPLIT_TOKENS)
        .flatMap((d) =>
          (
            [
              ['Opus', d.opus],
              ['Sonnet', d.sonnet],
              ['Other', d.other],
            ] as [ModelKey, number][]
          )
            .filter(([, v]) => v > 0)
            .map(([model, tokens]) => ({ day: d.key, label: d.label, model, tokens })),
        ),
    [points],
  );

  const definition = useMemo(() => {
    const keys = Array.from(new Set(rows.map((r) => r.day)));
    const labels = new Map(rows.map((r) => [r.day, r.label]));

    return defineChart({
      marks: [
        // LONG format, one row per (day, model). A single y channel stacks
        // implicitly; the explicit layout only pins the layer order so a day
        // missing Opus doesn't reshuffle the colours.
        barY(rows, {
          x: 'day',
          y: 'tokens',
          z: 'model',
          color: 'model',
          layout: stack({ order: ['Opus', 'Sonnet', 'Other'] }),
          radius: Radius.xs,
        }),
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
        y: { scale: scaleLinear, grid: false, axis: false },
      },
      color: {
        domain: ['Opus', 'Sonnet', 'Other'],
        range: [p.seriesOpus, p.seriesSonnet, p.seriesOther],
      },
      focus: false,
      pointer: false,
      focusRing: false,
      theme: { foreground: p.text, muted: p.textFaint, grid: p.grid, background: 'transparent' },
    });
  }, [rows, p]);

  if (rows.length === 0) return null;

  return (
    <Chart
      definition={definition}
      height={height}
      color={p.text}
      accessibilityLabel="Tokens by model per day, stacked"
      testID="model-split-chart"
    />
  );
}
