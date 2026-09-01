/**
 * Turning two consecutive counter readings into consumption.
 *
 * The counters reset — the session one every ~5 hours, the weekly ones once a
 * week — so a naive subtraction goes negative at every boundary. A negative
 * reaching a `SUM()` silently cancels real usage on other days, so this module
 * never returns one.
 */

/** Intervals at or under this are split proportionally across a bucket edge. */
export const FINE_MS = 10 * 60_000;
/** Day buckets are 24h; an interval past 24h/6 can't be pinned to a day. */
export const COARSE_DAY_MS = 4 * 3_600_000;
/** Sub-minute intervals are rate poison — one Mac refresh inside 30s reads as ~120x. */
export const MIN_RATE_DT_MS = 60_000;
/** A drop below this fraction of the previous reading is an undeclared roll. */
export const RESET_DROP_RATIO = 0.5;

export const KIND_NORMAL = 0;
export const KIND_RESET = 1;
export const KIND_ANOMALY = 2;
export const KIND_BASELINE = 3;
export type DeltaKind = 0 | 1 | 2 | 3;

export const QUALITY_FINE = 0;
export const QUALITY_COARSE = 1;
export const QUALITY_UNATTRIBUTED = 2;
export type Quality = 0 | 1 | 2;

export interface CounterReading {
  used: number;
  /** null for counters the payload gives no reset time for (Opus). */
  reset: number | null;
}

export interface CounterDelta {
  tokens: number;
  kind: DeltaKind;
}

/**
 * One counter's consumption between two samples.
 *
 * The pre-reset tail — whatever was spent between the last sample and the reset
 * instant — is unobservable. Counting it as zero is the only choice that
 * doesn't fabricate; assuming the old counter reached its limit would invent
 * data.
 */
export function counterDelta(prev: CounterReading, next: CounterReading): CounterDelta {
  if (prev.reset != null && next.reset != null && next.reset > prev.reset) {
    return { tokens: Math.max(0, next.used), kind: KIND_RESET };
  }
  const d = next.used - prev.used;
  if (d >= 0) return { tokens: d, kind: KIND_NORMAL };
  // Opus has NO reset field in the payload, so this branch is the only way its
  // week boundary is ever detected.
  if (next.used < prev.used * RESET_DROP_RATIO) {
    return { tokens: Math.max(0, next.used), kind: KIND_RESET };
  }
  // A small backwards step is a server-side correction, not negative usage.
  return { tokens: 0, kind: KIND_ANOMALY };
}

/**
 * How confidently an interval of `dtMs` can be pinned to a day bucket.
 *
 * Quality 2 tokens are REAL but their timing is unknown, so they count toward
 * the week total and enter no day or hour bar. Come back after three days
 * offline and one sample carries days of consumption: attributing it all to the
 * return day fabricates a record-breaking day, and spreading it proportionally
 * fabricates 3am usage that shows up directly in the hour-of-day chart.
 */
export function qualityFor(dtMs: number): Quality {
  if (dtMs <= FINE_MS) return QUALITY_FINE;
  if (dtMs <= COARSE_DAY_MS) return QUALITY_COARSE;
  return QUALITY_UNATTRIBUTED;
}

/**
 * Fraction of a fine interval that fell on each side of a day boundary.
 *
 * Without this, a weekly reset landing at 09:00 dumps the whole new window's
 * accrual onto whichever day the sample happens to land in, and one day per
 * week is systematically wrong.
 */
export function splitFractions(
  t0: number,
  t1: number,
  boundary: number,
): { before: number; after: number } {
  if (!(t1 > t0) || boundary <= t0 || boundary >= t1) return { before: 0, after: 1 };
  const before = (boundary - t0) / (t1 - t0);
  return { before, after: 1 - before };
}
