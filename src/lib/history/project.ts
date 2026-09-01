/**
 * Burn rate and projection.
 *
 * Every time here is in the MAC's frame. The phone converts once —
 * `nowMac = Date.now() - skew` — because skew cancels inside any delta (both
 * endpoints share it) and only matters at that one boundary.
 */
import { MIN_RATE_DT_MS, QUALITY_UNATTRIBUTED } from './derive';

export interface Interval {
  t0: number;
  t1: number;
  tokens: number;
  quality: number;
}

/** Responsive — "burning 45K/h right now". */
export const TAU_DISPLAY_MS = 15 * 60_000;
/** Stable — a projection that jumps by hours between polls is worse than useless. */
export const TAU_PROJECT_MS = 45 * 60_000;
/** Below this the rate is noise, not work. */
export const MIN_BURN = 1_000;
export const MIN_INTERVALS = 4;
/** Past this, a quiet Mac means stale data, not an idle user. */
export const STALE_MS = 15 * 60_000;

/**
 * Tokens per hour, EWMA'd with a TIME CONSTANT rather than a fixed alpha.
 *
 * Sampling is irregular by construction — the app backgrounds, the Mac sleeps —
 * so a fixed alpha would weight a 30-second interval exactly like a six-hour
 * one. Returns null when there isn't enough to answer honestly.
 */
export function burnRate(
  intervals: readonly Interval[],
  tauMs: number,
  nowMac: number,
  lastObserved: number,
): number | null {
  // A stale Mac looks exactly like an idle user, and decaying a real burn to
  // zero is a lie in the more dangerous direction.
  if (nowMac - lastObserved > STALE_MS) return null;

  let ewma: number | null = null;
  let usable = 0;
  for (const iv of intervals) {
    const dt = iv.t1 - iv.t0;
    if (dt < MIN_RATE_DT_MS) continue;
    if (iv.quality === QUALITY_UNATTRIBUTED) continue; // valid total, meaningless rate
    const r = iv.tokens / (dt / 3_600_000);
    const alpha = 1 - Math.exp(-dt / tauMs);
    ewma = ewma == null ? r : ewma + alpha * (r - ewma);
    usable++;
  }
  if (ewma == null || usable < MIN_INTERVALS) return null;
  // Silence since the last observation is evidence of idling, so the projection
  // recedes when you stop working.
  return ewma * Math.exp(-Math.max(0, nowMac - lastObserved) / tauMs);
}

export type Projection =
  | { kind: 'unknown'; reason: 'no-limit' | 'no-history' | 'stale' }
  | { kind: 'at-cap' }
  | { kind: 'imminent' }
  | { kind: 'idle'; projectedPct: number }
  | { kind: 'safe'; projectedPct: number }
  | { kind: 'cap-before-reset'; capAt: number; lockoutMs: number; projectedPct: number };

/**
 * Where the current window lands.
 *
 * `projectedPct` — usage at the reset if the current rate holds — is the better
 * primary number: it is defined in every non-degenerate case and bounded 0-100.
 * "Cap at HH:MM" is only defined in the one case where you actually run out.
 */
export function projectWindow(
  used: number,
  limit: number,
  resetAt: number,
  burn: number | null,
  nowMac: number,
): Projection {
  if (!(limit > 0)) return { kind: 'unknown', reason: 'no-limit' };
  if (used >= limit) return { kind: 'at-cap' };
  if (burn == null) return { kind: 'unknown', reason: 'no-history' };

  const hoursToReset = Math.max(0, (resetAt - nowMac) / 3_600_000);
  const projectedPct = Math.min(100, (100 * (used + burn * hoursToReset)) / limit);

  // Idle: show no time at all. Not Infinity, not "in 340 hours".
  if (burn < MIN_BURN) return { kind: 'idle', projectedPct };

  const msToCap = ((limit - used) / burn) * 3_600_000;
  // A clock time this close would already be stale by the time it rendered.
  if (msToCap < 60_000) return { kind: 'imminent' };

  const capAt = nowMac + msToCap;
  if (capAt >= resetAt) return { kind: 'safe', projectedPct };
  return { kind: 'cap-before-reset', capAt, lockoutMs: resetAt - capAt, projectedPct: 100 };
}

/**
 * Honest uncertainty: run both taus and render a RANGE when the fast and slow
 * estimates disagree by more than 15 minutes.
 */
export function capWindow(a: Projection, b: Projection): [number, number] | null {
  if (a.kind !== 'cap-before-reset' || b.kind !== 'cap-before-reset') return null;
  const lo = Math.min(a.capAt, b.capAt);
  const hi = Math.max(a.capAt, b.capAt);
  return hi - lo > 15 * 60_000 ? [lo, hi] : null;
}

/**
 * The rate that would exactly exhaust the window at the reset — the "sustainable
 * pace" reference line.
 */
export function sustainablePace(
  used: number,
  limit: number,
  resetAt: number,
  nowMac: number,
): number | null {
  const hours = (resetAt - nowMac) / 3_600_000;
  if (!(limit > 0) || hours <= 0) return null;
  return Math.max(0, limit - used) / hours;
}

/** EWMA of `received_at - server_time` — the phone's clock minus the Mac's. */
export function clockSkew(
  samples: readonly { received_at: number; server_time: number }[],
): number {
  if (samples.length === 0) return 0;
  const tau = 10;
  let ewma: number | null = null;
  for (const s of samples) {
    const skew = s.received_at - s.server_time;
    ewma = ewma == null ? skew : ewma + (1 / tau) * (skew - ewma);
  }
  return ewma ?? 0;
}

export interface RayPoint {
  t: number;
  used: number;
}

/**
 * The projection ray drawn on the burn-down: from where the measured line ends
 * to wherever the current rate runs out of budget or window, whichever is first.
 *
 * Both endpoints are measured from the SAME anchor. Mixing the anchor and the
 * clock draws the segment backwards whenever the newest observation is ahead of
 * the skew-corrected clock, which is routine — the Mac stamps `lastUpdated` on
 * its own clock.
 */
export function projectionRay(
  lastT: number,
  lastUsed: number,
  limit: number,
  resetAt: number,
  burn: number | null,
  nowMac: number,
): [RayPoint, RayPoint] | null {
  if (burn == null || burn <= 0) return null;
  const anchorT = Math.max(lastT, nowMac);
  const perMs = burn / 3_600_000;
  const msToCap = limit > lastUsed ? (limit - lastUsed) / perMs : 0;
  const endT = Math.min(resetAt, anchorT + msToCap);
  if (endT <= anchorT) return null;
  return [
    { t: anchorT, used: lastUsed },
    { t: endT, used: Math.min(limit, lastUsed + perMs * (endT - anchorT)) },
  ];
}
