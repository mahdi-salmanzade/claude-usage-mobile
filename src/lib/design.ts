/**
 * Design tokens. Warm, calm palette anchored on a clay accent — deliberately
 * not the reflexive "dev tool" navy/black. Neutrals are tinted toward the warm
 * hue (OKLCH-derived, no pure #000/#fff). Light and dark are both tuned for a
 * quick glance at a phone on a desk.
 *
 * One rule the charts depend on: STATUS colors and SERIES colors are separate
 * sets. `statusFor` maps safe/moderate/critical by REMAINING budget, so reusing
 * those hues for "Opus" vs "Sonnet" would make Opus read as danger.
 */
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface Palette {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceSunken: string;
  text: string;
  textSecondary: string;
  textFaint: string;
  border: string;
  track: string;
  accent: string;
  /** Accent at low strength, for tinted beds behind an accent glyph. */
  accentBed: string;
  // status (remaining-based), desaturated + warm-nudged
  safe: string;
  moderate: string;
  critical: string;
  /** Improving delta. Green means *improving*, never *good*. */
  positive: string;
  positiveBed: string;

  // ── chart surface ─────────────────────────────────────────────────────────
  /** A filled bar for a bucket other than the current one. */
  bar: string;
  /** Stub for a bucket that had coverage and genuinely zero usage. */
  barEmpty: string;
  /** Ghost for a bucket with no coverage — we don't know, which is not zero. */
  barGhost: string;
  grid: string;
  /** Categorical series. Never the status hues. */
  seriesOpus: string;
  seriesSonnet: string;
  seriesOther: string;
  seriesPrior: string;
}

const light: Palette = {
  scheme: 'light',
  bg: '#FAF7F2',
  surface: '#FFFDFA',
  surfaceSunken: '#F1ECE3',
  text: '#2A2520',
  textSecondary: '#74695F',
  textFaint: '#75695D',
  border: '#E8E2D8',
  track: '#ECE6DC',
  accent: '#B45536',
  accentBed: 'rgba(192,96,62,0.12)',
  safe: '#357D4E',
  moderate: '#926015',
  critical: '#C0533F',
  positive: '#357D4E',
  positiveBed: 'rgba(79,157,105,0.14)',

  bar: '#D6CCBE',
  barEmpty: '#EDE7DD',
  barGhost: 'rgba(168,158,146,0.18)',
  grid: '#EBE4D9',
  seriesOpus: '#7C5CBF',
  seriesSonnet: '#3E8FA8',
  seriesOther: '#B0A392',
  seriesPrior: '#CFC5B6',
};

const dark: Palette = {
  scheme: 'dark',
  bg: '#1A1613',
  surface: '#221E19',
  surfaceSunken: '#15110E',
  text: '#F4F0E8',
  textSecondary: '#A89E90',
  textFaint: '#A39888',
  border: '#322B24',
  track: '#2C2620',
  accent: '#E0875F',
  accentBed: 'rgba(224,135,95,0.16)',
  safe: '#5FB87E',
  moderate: '#E0A24A',
  critical: '#E0705A',
  positive: '#5FB87E',
  positiveBed: 'rgba(95,184,126,0.16)',

  bar: '#4A4038',
  barEmpty: '#2A241E',
  barGhost: 'rgba(118,108,95,0.22)',
  grid: '#2E2721',
  seriesOpus: '#9E80D8',
  seriesSonnet: '#5AAFC7',
  seriesOther: '#7E7264',
  seriesPrior: '#3E362E',
};

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export function paletteFor(scheme: 'light' | 'dark'): Palette {
  return scheme === 'dark' ? dark : light;
}

/** Status color from a used-percentage, matching the Mac app's battery semantics. */
export function statusFor(percentUsed: number, p: Palette): string {
  const remaining = 100 - percentUsed;
  if (remaining < 10) return p.critical;
  if (remaining < 20) return p.moderate;
  return p.safe;
}

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 } as const;
export const Radius = { xs: 4, sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const Type = {
  hero: 44,
  title: 22,
  metric: 17,
  body: 15,
  label: 13,
  caption: 12,
  micro: 11,
} as const;

/**
 * Motion. One entrance duration and one settle spring so a screen's elements
 * feel like one system rather than a pile of independently-tuned animations.
 */
export const Motion = {
  /** Ring/bar fill on fresh data. */
  fill: 950,
  /** A value changing in place. */
  settle: 420,
  /** Staggered entrance step. */
  stagger: 55,
} as const;

/** Alpha byte appended to a 6-digit hex — chart marks take no per-datum opacity. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${byte}`;
}
