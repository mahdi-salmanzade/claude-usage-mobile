import { areaY } from '@tanstack/charts/area';
import { lineY } from '@tanstack/charts/line';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react-native';
import { ruleY } from '@tanstack/charts/rule';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { defineChart } from '@tanstack/charts/scene';
import { useMemo } from 'react';

import { Type, usePalette } from '@/lib/design';
import { formatClock, formatTokens } from '@/lib/format';
import type { SessionPoint } from '@/lib/history';
import { projectionRay, type Projection } from '@/lib/history';

const CHART_HEIGHT = 150;

export interface SessionBurndownProps {
  points: readonly SessionPoint[];
  limit: number;
  /** Window start and reset, both in the MAC's clock frame. */
  startedAt: number;
  resetAt: number;
  nowMac: number;
  projection: Projection;
  burn: number | null;
  height?: number;
}

interface XY {
  id: string;
  t: number;
  used: number;
}

/**
 * The current 5-hour window, spent so far and projected forward.
 *
 * An area rather than a line because this is a cumulative quantity against a
 * capacity: the filled region reads as consumed and the space above it as
 * remaining runway. The x-axis deliberately extends past NOW all the way to the
 * reset — without the empty future there is no runway to see, which is the
 * whole point.
 *
 * The dashed ray is where the current burn rate lands. It stops at the cap or
 * at the reset, whichever comes first, so it never draws usage past a wall the
 * user cannot cross.
 */
export function SessionBurndown({
  points,
  limit,
  startedAt,
  resetAt,
  nowMac,
  projection,
  burn,
  height = CHART_HEIGHT,
}: SessionBurndownProps) {
  const p = usePalette();

  const actual = useMemo<XY[]>(() => {
    const rows = points.map((s, i) => ({ id: `a${i}`, t: s.t, used: s.used }));
    // Anchor the area at the window start so a window observed late still
    // renders against its full span rather than starting mid-chart.
    if (rows.length > 0 && rows[0].t > startedAt) rows.unshift({ id: 'start', t: startedAt, used: 0 });
    return rows;
  }, [points, startedAt]);

  const projected = useMemo<XY[]>(() => {
    const last = actual[actual.length - 1];
    if (!last) return [];
    const ray = projectionRay(last.t, last.used, limit, resetAt, burn, nowMac);
    return ray ? [{ id: 'p0', ...ray[0] }, { id: 'p1', ...ray[1] }] : [];
  }, [actual, burn, limit, nowMac, resetAt]);

  const definition = useMemo(() => {
    const capReached = projection.kind === 'cap-before-reset';
    const rayColor = capReached ? p.critical : p.textSecondary;

    return defineChart({
      marks: [
        areaY(actual, {
          x: 't',
          y: 'used',
          y1: 0,
          key: 'id',
          fill: 'url(#burn-fill)',
          fillOpacity: 1,
        }),
        lineY(actual, { x: 't', y: 'used', key: 'id', stroke: p.accent, strokeWidth: 2 }),
        ...(projected.length > 0
          ? [
              decorative(
                lineY(projected, {
                  x: 't',
                  y: 'used',
                  key: 'id',
                  stroke: rayColor,
                  strokeWidth: 2,
                  strokeDasharray: '5 4',
                }),
              ),
            ]
          : []),
        decorative(
          ruleY([limit], {
            stroke: p.critical,
            strokeOpacity: 0.5,
            strokeWidth: 1.5,
            strokeDasharray: '3 3',
          }),
        ),
      ],
      scales: {
        x: {
          scale: () => scaleLinear().domain([startedAt, resetAt]),
          axis: {
            line: false,
            ticks: { count: 4, size: 0, format: (ms: number) => formatClock(ms) },
            tickLabels: { fontSize: Type.micro },
          },
        },
        y: {
          scale: () => scaleLinear().domain([0, Math.max(limit, 1) * 1.04]),
          grid: false,
          axis: {
            line: false,
            ticks: { values: [limit], size: 0, format: (v: number) => formatTokens(v) },
            tickLabels: { fontSize: Type.micro },
          },
        },
      },
      gradients: [
        {
          id: 'burn-fill',
          // Bottom-to-top; these are also the renderer's defaults.
          x1: 0,
          y1: 1,
          x2: 0,
          y2: 0,
          stops: [
            { offset: 0, color: p.accent, opacity: 0 },
            { offset: 1, color: p.accent, opacity: 0.28 },
          ],
        },
      ],
      clip: true,
      focus: false,
      pointer: false,
      focusRing: false,
      theme: { foreground: p.text, muted: p.textFaint, grid: p.grid, background: 'transparent' },
    });
  }, [actual, projected, limit, startedAt, resetAt, projection.kind, p]);

  return (
    <Chart
      definition={definition}
      height={height}
      color={p.text}
      accessibilityLabel="Session tokens used over the current five-hour window, with the projected trajectory"
      testID="session-burndown"
    />
  );
}
