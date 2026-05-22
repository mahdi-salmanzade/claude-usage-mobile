/**
 * Design tokens. Warm, calm palette anchored on a clay accent — deliberately
 * not the reflexive "dev tool" navy/black. Neutrals are tinted toward the warm
 * hue (OKLCH-derived, no pure #000/#fff). Light and dark are both tuned for a
 * quick glance at a phone on a desk.
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
  // status (remaining-based), desaturated + warm-nudged
  safe: string;
  moderate: string;
  critical: string;
}

const light: Palette = {
  scheme: 'light',
  bg: '#FAF7F2',
  surface: '#FFFDFA',
  surfaceSunken: '#F1ECE3',
  text: '#2A2520',
  textSecondary: '#7C7266',
  textFaint: '#A89E92',
  border: '#E8E2D8',
  track: '#ECE6DC',
  accent: '#C0603E',
  safe: '#4F9D69',
  moderate: '#C2872F',
  critical: '#C0533F',
};

const dark: Palette = {
  scheme: 'dark',
  bg: '#1A1613',
  surface: '#221E19',
  surfaceSunken: '#15110E',
  text: '#F4F0E8',
  textSecondary: '#A89E90',
  textFaint: '#766C5F',
  border: '#322B24',
  track: '#2C2620',
  accent: '#E0875F',
  safe: '#5FB87E',
  moderate: '#E0A24A',
  critical: '#E0705A',
};

export function usePalette(): Palette {
  const scheme = useColorScheme();
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
export const Radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const Type = {
  hero: 44,
  title: 22,
  metric: 17,
  body: 15,
  label: 13,
  caption: 12,
} as const;
