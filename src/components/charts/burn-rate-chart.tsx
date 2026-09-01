import { dot } from '@tanstack/charts/dot';
import { lineY } from '@tanstack/charts/line';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react-native';
import { ruleY } from '@tanstack/charts/rule';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { defineChart } from '@tanstack/charts/scene';
import { useMemo } from 'react';

import { Type, usePalette } from '@/lib/design';
import { formatClock, formatRate } from '@/lib/format';
import type { RateSample } from '@/lib/history';

const CHART_HEIGHT = 132;
/** A break longer than this is a gap, not a measurement. */
const GAP_MS = 20 * 60_000;

export interface BurnRateChartProps {
  samples: readonly RateSample[];
  /** The rate that would exactly exhaust the window at its reset. */
  pace?: number | null;
  from: number;
  to: number;
  height?: number;
}

interface Step {
  /** Unique per row: consecutive intervals share an endpoint timestamp. */
  id: string;
  t: number;
  rate: number;
  seg: number;
}

/**
 * Tokens per hour over time.
 *
 * A STEPPED line, because a per-interval rate is piecewise-constant by
 * construction — a smooth curve would imply instants that were never measured.
 * Each interval contributes its start and end at the same height.
 *
 * Gaps render as real breaks. Bridging them would draw a rate that was never
 * observed, so each contiguous run is its own series and the line simply stops.
 */
export function BurnRateChart({ samples, pace, from, to, height = CHART_HEIGHT }: BurnRateChartProps) {
  const p = usePalette();

  const { steps, segments, maxRate } = useMemo(() => {
    const out: Step[] = [];
    let seg = 0;
    let prevEnd: number | null = null;
    samples.forEach((s, i) => {
      if (prevEnd != null && s.t0 - prevEnd > GAP_MS) seg++;
      out.push({ id: `${i}a`, t: s.t0, rate: s.rate, seg });
      out.push({ id: `${i}b`, t: s.t1, rate: s.rate, seg });
      prevEnd = s.t1;
    });
    return {
      steps: out,
      segments: seg + 1,
      maxRate: Math.max(1, ...samples.map((s) => s.rate), pace ?? 0),
    };
  }, [samples, pace]);

  const definition = useMemo(() => {
    const runs = Array.from({ length: segments }, (_, i) => steps.filter((s) => s.seg === i)).filter(
      (r) => r.length > 1,
    );

    return defineChart({
      marks: [
        // Raw per-interval rates behind the line: the measurements the steps
        // are made of, faint enough not to compete with them.
        decorative(
          dot(
            samples.map((s, i) => ({ id: `${i}`, t: s.t, rate: s.rate })),
            { x: 't', y: 'rate', key: 'id', r: 1.6, fill: p.textFaint },
          ),
        ),
        ...runs.map((run) =>
          lineY(run, { x: 't', y: 'rate', key: 'id', stroke: p.accent, strokeWidth: 2 }),
        ),
        ...(pace != null && pace > 0
          ? [
              decorative(
                ruleY([pace], {
                  stroke: p.textFaint,
                  strokeOpacity: 0.5,
                  strokeWidth: 1.5,
                  strokeDasharray: '4 4',
                }),
              ),
            ]
          : []),
      ],
      scales: {
        x: {
          scale: () => scaleLinear().domain([from, to]),
          axis: {
            line: false,
            ticks: { count: 4, size: 0, format: (ms: number) => formatClock(ms) },
            tickLabels: { fontSize: Type.micro },
          },
        },
        y: {
          scale: () => scaleLinear().domain([0, maxRate * 1.1]),
          grid: true,
          axis: {
            line: false,
            ticks: { count: 3, size: 0, format: (v: number) => formatRate(v) },
            tickLabels: { fontSize: Type.micro },
          },
        },
      },
      clip: true,
      focus: false,
      pointer: false,
      focusRing: false,
      theme: { foreground: p.text, muted: p.textFaint, grid: p.grid, background: 'transparent' },
    });
  }, [steps, segments, samples, pace, from, to, maxRate, p]);

  if (samples.length === 0) return null;

  return (
    <Chart
      definition={definition}
      height={height}
      color={p.text}
      accessibilityLabel="Token burn rate over time, in tokens per hour"
      testID="burn-rate-chart"
    />
  );
}
