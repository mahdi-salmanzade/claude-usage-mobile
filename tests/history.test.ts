/**
 * Unit tests for the history layer's pure math.
 *
 * These modules import nothing from React or Expo, so they run under Node's
 * native type stripping: `npm test`.
 *
 * The cases here are the ones that silently produce a wrong chart rather than
 * an error — a negative delta cancelling real usage, a DST step skipping a day,
 * an idle projection reading as safe.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  KIND_ANOMALY,
  KIND_NORMAL,
  KIND_RESET,
  QUALITY_COARSE,
  QUALITY_FINE,
  QUALITY_UNATTRIBUTED,
  counterDelta,
  qualityFor,
  splitFractions,
} from '../src/lib/history/derive';
import {
  MIN_BURN,
  burnRate,
  capWindow,
  clockSkew,
  projectWindow,
  projectionRay,
  sustainablePace,
} from '../src/lib/history/project';
import { dayKeyRange, dayKeyToMs, shiftDayKey, zoned } from '../src/lib/history/zone';

const HOUR = 3_600_000;

// ── counterDelta ────────────────────────────────────────────────────────────

test('normal accumulation subtracts', () => {
  const d = counterDelta({ used: 100, reset: 10 }, { used: 250, reset: 10 });
  assert.deepEqual(d, { tokens: 150, kind: KIND_NORMAL });
});

test('a declared roll counts only the new window, never the unobservable tail', () => {
  // The counter went 900 -> 40 with the reset time moving forward. The tokens
  // spent between the last sample and the reset instant cannot be observed;
  // inventing them would be worse than omitting them.
  const d = counterDelta({ used: 900, reset: 1000 }, { used: 40, reset: 2000 });
  assert.deepEqual(d, { tokens: 40, kind: KIND_RESET });
});

test('Opus has no reset field, so a big drop is the only roll signal', () => {
  const d = counterDelta({ used: 800, reset: null }, { used: 30, reset: null });
  assert.deepEqual(d, { tokens: 30, kind: KIND_RESET });
});

test('a small backwards step is a server correction, clamped to zero', () => {
  const d = counterDelta({ used: 800, reset: 10 }, { used: 780, reset: 10 });
  assert.deepEqual(d, { tokens: 0, kind: KIND_ANOMALY });
});

test('never returns a negative — one would cancel real usage in a SUM', () => {
  for (const [a, b] of [
    [100, 99],
    [1_000_000, 1],
    [5, 0],
    [0, 0],
  ] as const) {
    assert.ok(counterDelta({ used: a, reset: 1 }, { used: b, reset: 1 }).tokens >= 0);
  }
});

// ── quality ─────────────────────────────────────────────────────────────────

test('quality tiers by interval width', () => {
  assert.equal(qualityFor(60_000), QUALITY_FINE);
  assert.equal(qualityFor(10 * 60_000), QUALITY_FINE);
  assert.equal(qualityFor(30 * 60_000), QUALITY_COARSE);
  assert.equal(qualityFor(4 * HOUR), QUALITY_COARSE);
  assert.equal(qualityFor(6 * HOUR), QUALITY_UNATTRIBUTED);
});

test('splitFractions divides an interval at a boundary inside it', () => {
  const f = splitFractions(0, 100, 25);
  assert.equal(f.before, 0.25);
  assert.equal(f.after, 0.75);
});

test('splitFractions puts everything after when the boundary is outside', () => {
  assert.deepEqual(splitFractions(0, 100, 0), { before: 0, after: 1 });
  assert.deepEqual(splitFractions(0, 100, 100), { before: 0, after: 1 });
  assert.deepEqual(splitFractions(0, 100, 500), { before: 0, after: 1 });
});

// ── burn rate ───────────────────────────────────────────────────────────────

const now = 10 * HOUR;

function evenIntervals(count: number, tokensPerHour: number, spanMs = 30 * 60_000) {
  return Array.from({ length: count }, (_, i) => ({
    t0: now - (count - i) * spanMs,
    t1: now - (count - i - 1) * spanMs,
    tokens: (tokensPerHour * spanMs) / HOUR,
    quality: QUALITY_FINE as number,
  }));
}

test('burn rate converges on a steady rate', () => {
  const r = burnRate(evenIntervals(12, 60_000), 15 * 60_000, now, now);
  assert.ok(r != null, 'expected a rate');
  assert.ok(Math.abs(r - 60_000) < 6_000, `expected ~60K/h, got ${r}`);
});

test('burn rate is null with too few usable intervals', () => {
  assert.equal(burnRate(evenIntervals(2, 60_000), 15 * 60_000, now, now), null);
});

test('sub-minute intervals are excluded — one refresh inside 30s reads as ~120x', () => {
  const spiky = [
    ...evenIntervals(6, 10_000),
    { t0: now - 20_000, t1: now, tokens: 50_000, quality: QUALITY_FINE as number },
  ];
  const r = burnRate(spiky, 15 * 60_000, now, now);
  assert.ok(r != null, 'expected a rate');
  assert.ok(r < 50_000, `spike leaked into the rate: ${r}`);
});

test('an offline gap has a valid total but contributes no rate', () => {
  const withGap = [
    { t0: now - 30 * HOUR, t1: now - 6 * HOUR, tokens: 5_000_000, quality: QUALITY_UNATTRIBUTED as number },
    ...evenIntervals(6, 20_000),
  ];
  const r = burnRate(withGap, 15 * 60_000, now, now);
  assert.ok(r != null, 'expected a rate');
  assert.ok(r < 40_000, `gap leaked into the rate: ${r}`);
});

test('a stale Mac returns null rather than decaying to a safe-looking zero', () => {
  const lastObserved = now - 40 * 60_000;
  assert.equal(burnRate(evenIntervals(12, 60_000), 15 * 60_000, now, lastObserved), null);
});

test('silence within the freshness window decays the rate', () => {
  const fresh = burnRate(evenIntervals(12, 60_000), 15 * 60_000, now, now)!;
  const quiet = burnRate(evenIntervals(12, 60_000), 15 * 60_000, now, now - 10 * 60_000)!;
  assert.ok(quiet < fresh, 'idling should pull the rate down');
});

// ── projection ──────────────────────────────────────────────────────────────

const reset = now + 2 * HOUR;

test('no limit means no projection', () => {
  assert.deepEqual(projectWindow(0, 0, reset, 1000, now), { kind: 'unknown', reason: 'no-limit' });
});

test('at or over the cap never projects', () => {
  assert.deepEqual(projectWindow(100, 100, reset, 50_000, now), { kind: 'at-cap' });
  assert.deepEqual(projectWindow(120, 100, reset, 50_000, now), { kind: 'at-cap' });
});

test('no burn rate means no-history, not zero', () => {
  assert.deepEqual(projectWindow(10, 100, reset, null, now), { kind: 'unknown', reason: 'no-history' });
});

test('an idle rate shows a percentage and no clock time', () => {
  const r = projectWindow(50_000, 200_000, reset, MIN_BURN - 1, now);
  assert.equal(r.kind, 'idle');
  assert.ok(r.kind === 'idle' && Number.isFinite(r.projectedPct));
});

test('a safe pace reports where the window lands', () => {
  // 10K/h for 2h on top of 50K of a 200K budget → 70K, i.e. 35%.
  const r = projectWindow(50_000, 200_000, reset, 10_000, now);
  assert.equal(r.kind, 'safe');
  assert.ok(r.kind === 'safe' && Math.abs(r.projectedPct - 35) < 0.001);
});

test('an unsustainable pace reports the cap time and the lockout', () => {
  // 100K remaining at 100K/h → exactly 1h, an hour before the reset.
  const r = projectWindow(100_000, 200_000, reset, 100_000, now);
  assert.equal(r.kind, 'cap-before-reset');
  if (r.kind !== 'cap-before-reset') return;
  assert.ok(Math.abs(r.capAt - (now + HOUR)) < 1000);
  assert.ok(Math.abs(r.lockoutMs - HOUR) < 1000);
});

test('a cap under a minute away is imminent, not a clock time already stale', () => {
  const r = projectWindow(199_999, 200_000, reset, 1_000_000, now);
  assert.equal(r.kind, 'imminent');
});

test('projected percentage is bounded at 100', () => {
  const r = projectWindow(10_000, 200_000, reset, 10_000_000, now);
  assert.ok(r.kind === 'cap-before-reset' && r.projectedPct === 100);
});

test('capWindow reports a range only when the two taus really disagree', () => {
  const slow = projectWindow(100_000, 200_000, reset, 100_000, now);
  const fastish = projectWindow(100_000, 200_000, reset, 105_000, now);
  const veryFast = projectWindow(100_000, 200_000, reset, 200_000, now);
  assert.equal(capWindow(slow, fastish), null, 'a 3-minute disagreement is not worth a range');
  assert.notEqual(capWindow(slow, veryFast), null);
});

test('sustainable pace is the rate that exactly exhausts the window', () => {
  assert.equal(sustainablePace(0, 200_000, now + 2 * HOUR, now), 100_000);
  assert.equal(sustainablePace(0, 200_000, now - 1, now), null, 'a past reset has no pace');
});

test('clock skew averages received minus server time', () => {
  const skew = clockSkew(Array.from({ length: 40 }, () => ({ received_at: 5_000, server_time: 3_000 })));
  assert.ok(Math.abs(skew - 2_000) < 200);
  assert.equal(clockSkew([]), 0);
});

// ── zone ────────────────────────────────────────────────────────────────────

test('zoned buckets into the given zone, not the device zone', () => {
  // 2026-03-01T23:30:00Z is already the 2nd in Tokyo (UTC+9).
  const ms = Date.UTC(2026, 2, 1, 23, 30);
  assert.equal(zoned(ms, 'Asia/Tokyo').dayKey, '2026-03-02');
  assert.equal(zoned(ms, 'UTC').dayKey, '2026-03-01');
  assert.equal(zoned(ms, 'America/New_York').dayKey, '2026-03-01');
});

test('zoned reports an east-positive offset, the opposite of getTimezoneOffset', () => {
  const ms = Date.UTC(2026, 6, 1, 12, 0);
  assert.equal(zoned(ms, 'Asia/Tokyo').offsetMin, 540);
  assert.equal(zoned(ms, 'America/New_York').offsetMin, -240);
  assert.equal(zoned(ms, 'UTC').offsetMin, 0);
});

test('midnight lands in hour 0, never a phantom hour 24', () => {
  const midnightTokyo = Date.UTC(2026, 5, 10, 15, 0); // 00:00 on the 11th, UTC+9
  const z = zoned(midnightTokyo, 'Asia/Tokyo');
  assert.equal(z.hour, 0);
  assert.equal(z.dayKey, '2026-06-11');
});

test('an unknown zone falls back rather than dropping the sample', () => {
  const z = zoned(Date.UTC(2026, 0, 1, 12), 'Not/AZone');
  assert.match(z.dayKey, /^\d{4}-\d{2}-\d{2}$/);
});

test('dayKeyToMs is local midnight, not UTC midnight', () => {
  // UTC-5: local midnight on the 1st is 05:00Z, not 00:00Z.
  assert.equal(dayKeyToMs('2026-01-01', -300), Date.UTC(2026, 0, 1, 5, 0));
  assert.equal(dayKeyToMs('2026-01-01', 0), Date.UTC(2026, 0, 1));
});

test('shiftDayKey steps calendar days across a DST boundary', () => {
  // US DST starts 2026-03-08. A fixed 86_400_000ms step would repeat a day.
  assert.equal(shiftDayKey('2026-03-07', 1), '2026-03-08');
  assert.equal(shiftDayKey('2026-03-08', 1), '2026-03-09');
  assert.equal(shiftDayKey('2026-03-09', -2), '2026-03-07');
  assert.equal(shiftDayKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDayKey('2027-01-01', -1), '2026-12-31');
});

test('dayKeyRange is inclusive and covers a DST week without gaps or repeats', () => {
  const range = dayKeyRange('2026-03-05', '2026-03-11');
  assert.equal(range.length, 7);
  assert.equal(range[0], '2026-03-05');
  assert.equal(range[6], '2026-03-11');
  assert.equal(new Set(range).size, 7);
});

// ── projection ray ──────────────────────────────────────────────────────────

test('the ray runs forward from the last measurement', () => {
  const ray = projectionRay(now, 100_000, 220_000, now + 3 * HOUR, 60_000, now);
  assert.ok(ray);
  const [a, b] = ray;
  assert.equal(a.t, now);
  assert.equal(a.used, 100_000);
  assert.ok(b.t > a.t, 'the ray must move forward in time');
  assert.ok(b.used > a.used, 'and upward in usage');
});

test('the ray still runs forward when the last observation leads the clock', () => {
  // The Mac stamps `lastUpdated` on its own clock, so an observation can sit
  // ahead of the skew-corrected `nowMac`. When it leads by MORE than the
  // time-to-cap, anchoring at the point while deriving the end from the clock
  // put the far endpoint BEHIND the near one and drew the ray backwards.
  //
  // 120K of headroom at 1M/h is ~7 minutes to the cap, against an observation
  // an hour ahead of the clock.
  const lastT = now + 60 * 60_000;
  const ray = projectionRay(lastT, 100_000, 220_000, now + 6 * HOUR, 1_000_000, now);
  assert.ok(ray, 'expected a ray');
  const [a, b] = ray;
  assert.equal(a.t, lastT, 'anchored at the newest observation');
  assert.ok(b.t > a.t, `ray ran backwards: ${a.t} -> ${b.t}`);
  assert.ok(b.used >= a.used, 'and never downward in usage');
});

test('the ray stops at the cap, never above it', () => {
  const ray = projectionRay(now, 200_000, 220_000, now + 10 * HOUR, 1_000_000, now);
  assert.ok(ray);
  assert.ok(ray[1].used <= 220_000);
});

test('the ray stops at the reset when the budget would outlast the window', () => {
  const resetAt = now + HOUR;
  const ray = projectionRay(now, 10_000, 220_000, resetAt, 20_000, now);
  assert.ok(ray);
  assert.equal(ray[1].t, resetAt);
});

test('no ray without a rate, or once the window has closed', () => {
  assert.equal(projectionRay(now, 10_000, 220_000, now + HOUR, null, now), null);
  assert.equal(projectionRay(now, 10_000, 220_000, now + HOUR, 0, now), null);
  assert.equal(projectionRay(now, 10_000, 220_000, now - HOUR, 50_000, now), null);
});
