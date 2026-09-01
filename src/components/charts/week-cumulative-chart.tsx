import { lineY } from '@tanstack/charts/line';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react-native';
import { ruleX } from '@tanstack/charts/rule';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { defineChart } from '@tanstack/charts/scene';
import { useMemo } from 'react';

import { Type, usePalette } from '@/lib/design';
import { formatTokens } from '@/lib/format';
import type { CumulativePoint } from '@/lib/history';

const CHART_HEIGHT = 140;

/**
 * This week against last week, both as cumulative curves over elapsed-week
 * fraction.
 *
 * Not two bars — two bars is a table with extra steps. The real question is "am
 * I ahead of last week's pace?", and that is answered by which curve is on top
 * at the same point in the week. Plotting against elapsed fraction rather than
 * wall-clock is what makes them comparable at all.
 */
export function WeekCumulativeChart({
  current,
  prior,
  fraction,
  height = CHART_HEIGHT,
}: {
  current: readonly CumulativePoint[];
  prior: readonly CumulativePoint[];
  /** 0-1 through the current week — where "now" sits on the x-axis. */
  fraction: number;
  height?: number;
}) {
  const p = usePalette();

  const max = useMemo(
    () => Math.max(1, ...current.map((c) => c.tokens), ...prior.map((c) => c.tokens)),
    [current, prior],
  );

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          ...(prior.length > 1
            ? [
                decorative(
                  lineY(prior as CumulativePoint[], {
                    x: 'f',
                    y: 'tokens',
                    key: 'id',
                    stroke: p.seriesPrior,
                    strokeWidth: 2,
                  }),
                ),
              ]
            : []),
          lineY(current as CumulativePoint[], {
            x: 'f',
            y: 'tokens',
            key: 'id',
            stroke: p.accent,
            strokeWidth: 2.5,
          }),
          decorative(
            ruleX([fraction], { stroke: p.textFaint, strokeOpacity: 0.35, strokeDasharray: '3 3' }),
          ),
        ],
        scales: {
          x: {
            scale: () => scaleLinear().domain([0, 1]),
            axis: {
              line: false,
              ticks: {
                values: [0, 0.5, 1],
                size: 0,
                format: (v: number) => (v === 0 ? 'week start' : v === 1 ? 'reset' : ''),
              },
              tickLabels: { fontSize: Type.micro },
            },
          },
          y: {
            scale: () => scaleLinear().domain([0, max * 1.08]),
            grid: true,
            axis: {
              line: false,
              ticks: { count: 3, size: 0, format: (v: number) => formatTokens(v) },
              tickLabels: { fontSize: Type.micro },
            },
          },
        },
        clip: true,
        focus: false,
        pointer: false,
        focusRing: false,
        theme: { foreground: p.text, muted: p.textFaint, grid: p.grid, background: 'transparent' },
      }),
    [current, prior, fraction, max, p],
  );

  if (current.length < 2) return null;

  return (
    <Chart
      definition={definition}
      height={height}
      color={p.text}
      accessibilityLabel="Cumulative tokens this week compared with last week at the same point"
      testID="week-cumulative-chart"
    />
  );
}
