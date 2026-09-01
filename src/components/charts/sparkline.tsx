import { areaY } from '@tanstack/charts/area';
import { lineY } from '@tanstack/charts/line';
import { Chart } from '@tanstack/charts/react-native';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { defineChart } from '@tanstack/charts/scene';
import { useMemo } from 'react';

import { usePalette } from '@/lib/design';

/**
 * A trend with no chrome at all.
 *
 * `guides: false` removes the axes AND the implicit margins they reserve —
 * `axis: false` alone would leave auto-measured space behind and the line would
 * float in a box larger than it looks.
 */
export function Sparkline({
  points,
  width,
  height = 34,
  color,
  filled = true,
  gradientId = 'spark-fill',
  label,
}: {
  points: readonly { x: number; y: number }[];
  width?: number;
  height?: number;
  color?: string;
  filled?: boolean;
  /** Unique per mounted sparkline; ids are scoped per <Chart> but not across props. */
  gradientId?: string;
  label: string;
}) {
  const p = usePalette();
  const stroke = color ?? p.accent;

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          ...(filled
            ? [areaY(points as { x: number; y: number }[], { x: 'x', y: 'y', y1: 0, key: 'x', fill: `url(#${gradientId})` })]
            : []),
          lineY(points as { x: number; y: number }[], { x: 'x', y: 'y', key: 'x', stroke, strokeWidth: 1.75 }),
        ],
        scales: { x: { scale: scaleLinear }, y: { scale: scaleLinear } },
        gradients: [
          {
            id: gradientId,
            stops: [
              { offset: 0, color: stroke, opacity: 0 },
              { offset: 1, color: stroke, opacity: 0.3 },
            ],
          },
        ],
        guides: false,
        margin: 0,
        clip: true,
        focus: false,
        pointer: false,
        focusRing: false,
        theme: { foreground: stroke, muted: stroke, grid: 'transparent', background: 'transparent' },
      }),
    [points, stroke, filled, gradientId],
  );

  // Both dimensions or nothing renders: with no height the scene resolves null.
  if (points.length < 2) return null;

  return (
    <Chart
      definition={definition}
      width={width}
      height={height}
      color={stroke}
      accessibilityLabel={label}
    />
  );
}
