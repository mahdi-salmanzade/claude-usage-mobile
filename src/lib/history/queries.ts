/**
 * Everything the charts read.
 *
 * Two rules run through all of it. Coverage travels with every aggregate, so a
 * day with full coverage and zero tokens ("I didn't work") never renders the
 * same as a day with no samples ("the phone was off"). And unattributed tokens
 * — real consumption whose timing is unknown — are reported separately rather
 * than smeared across buckets they were never observed in.
 */
import type * as SQLite from 'expo-sqlite';

import { QUALITY_FINE, QUALITY_UNATTRIBUTED } from './derive';
import type { SampleRow, WindowRow } from './schema';
import type { Interval } from './project';

export interface DayBucket {
  dayKey: string;
  tokens: number;
  opus: number;
  sonnet: number;
  /** weekly − opus − sonnet. Never derived by subtraction alone downstream. */
  other: number;
  unattributed: number;
  coverageSec: number;
  /** 0-1 fraction of the day we were actually observing. */
  coverage: number;
  hasCoverage: boolean;
}

const DAY_BARS = `
SELECT day_key,
       SUM(CASE WHEN quality < 2 THEN d_weekly ELSE 0 END) AS tokens,
       SUM(CASE WHEN quality < 2 THEN d_opus   ELSE 0 END) AS opus,
       SUM(CASE WHEN quality < 2 THEN d_sonnet ELSE 0 END) AS sonnet,
       SUM(CASE WHEN quality = 2 THEN d_weekly ELSE 0 END) AS unattributed,
       SUM(CASE WHEN quality < 2 THEN dt_ms    ELSE 0 END) / 1000 AS coverage_sec
  FROM deltas
 WHERE profile = ? AND day_key >= ?
 GROUP BY day_key
 ORDER BY day_key`;

/** A day needs at least this much observation before its bar means anything. */
const MIN_DAY_COVERAGE_SEC = 3600;

export async function dayBuckets(
  db: SQLite.SQLiteDatabase,
  profile: string,
  sinceDayKey: string,
): Promise<DayBucket[]> {
  const rows = await db.getAllAsync<{
    day_key: string;
    tokens: number;
    opus: number;
    sonnet: number;
    unattributed: number;
    coverage_sec: number;
  }>(DAY_BARS, [profile, sinceDayKey]);

  return rows.map((r) => ({
    dayKey: r.day_key,
    tokens: r.tokens ?? 0,
    opus: r.opus ?? 0,
    sonnet: r.sonnet ?? 0,
    other: Math.max(0, (r.tokens ?? 0) - (r.opus ?? 0) - (r.sonnet ?? 0)),
    unattributed: r.unattributed ?? 0,
    coverageSec: r.coverage_sec ?? 0,
    coverage: Math.min(1, (r.coverage_sec ?? 0) / 86_400),
    hasCoverage: (r.coverage_sec ?? 0) >= MIN_DAY_COVERAGE_SEC,
  }));
}

export interface HourBucket {
  hour: number;
  /** Mean tokens per covered day. null = no bar at all, which is not a zero bar. */
  meanTokens: number | null;
  coveredDays: number;
}

/**
 * The denominator is days that actually had coverage of that hour.
 *
 * Using "days in range" instead makes every night hour read artificially low
 * purely because the phone was asleep — manufacturing exactly the confident,
 * wrong conclusion ("I never work at night") this chart exists to prevent.
 */
const HOUR_PROFILE = `
WITH cell AS (
  SELECT day_key, hour,
         SUM(d_weekly) AS tokens,
         SUM(dt_ms) / 1000.0 AS cov
    FROM deltas
   WHERE profile = ? AND quality = 0 AND day_key >= ?
   GROUP BY day_key, hour
)
SELECT hour,
       COALESCE(SUM(CASE WHEN cov >= 1800 THEN tokens END), 0) AS tokens,
       COUNT(CASE WHEN cov >= 1800 THEN 1 END)                 AS covered_days
  FROM cell
 GROUP BY hour
 ORDER BY hour`;

export async function hourProfile(
  db: SQLite.SQLiteDatabase,
  profile: string,
  sinceDayKey: string,
): Promise<HourBucket[]> {
  const rows = await db.getAllAsync<{ hour: number; tokens: number; covered_days: number }>(
    HOUR_PROFILE,
    [profile, sinceDayKey],
  );
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, h) => {
    const r = byHour.get(h);
    const covered = r?.covered_days ?? 0;
    return {
      hour: h,
      meanTokens: covered > 0 ? (r!.tokens ?? 0) / covered : null,
      coveredDays: covered,
    };
  });
}

export async function intervalsSince(
  db: SQLite.SQLiteDatabase,
  profile: string,
  sinceMs: number,
): Promise<Interval[]> {
  const rows = await db.getAllAsync<{ t0: number; t1: number; d_weekly: number; quality: number }>(
    'SELECT t0, t1, d_weekly, quality FROM deltas WHERE profile = ? AND t1 >= ? ORDER BY t1',
    [profile, sinceMs],
  );
  return rows.map((r) => ({ t0: r.t0, t1: r.t1, tokens: r.d_weekly, quality: r.quality }));
}

export interface RateSample {
  /** Interval midpoint — a per-interval rate has no single instant. */
  t: number;
  t0: number;
  t1: number;
  rate: number;
  quality: number;
}

/**
 * Per-interval rates over a window.
 *
 * `bucketMs` aggregates intervals into fixed slots before computing the rate.
 * Without it a 7-day view plots ~800 twelve-minute steps, each under a pixel
 * wide — technically honest and completely unreadable. Aggregating divides
 * summed tokens by summed OBSERVED time, so a slot we only half-watched still
 * reports the rate we actually measured rather than being diluted toward zero.
 */
export async function rateSamples(
  db: SQLite.SQLiteDatabase,
  profile: string,
  sinceMs: number,
  bucketMs = 0,
): Promise<RateSample[]> {
  const rows = await db.getAllAsync<{ t0: number; t1: number; d_weekly: number; quality: number }>(
    'SELECT t0, t1, d_weekly, quality FROM deltas WHERE profile = ? AND t1 >= ? AND dt_ms >= 60000 ORDER BY t1',
    [profile, sinceMs],
  );
  const usable = rows.filter((r) => r.quality !== QUALITY_UNATTRIBUTED);

  if (bucketMs <= 0) {
    return usable.map((r) => ({
      t: r.t0 + (r.t1 - r.t0) / 2,
      t0: r.t0,
      t1: r.t1,
      rate: r.d_weekly / ((r.t1 - r.t0) / 3_600_000),
      quality: r.quality,
    }));
  }

  const slots = new Map<number, { tokens: number; observed: number; quality: number }>();
  for (const r of usable) {
    const slot = Math.floor(r.t1 / bucketMs) * bucketMs;
    const acc = slots.get(slot) ?? { tokens: 0, observed: 0, quality: 0 };
    acc.tokens += r.d_weekly;
    acc.observed += r.t1 - r.t0;
    acc.quality = Math.max(acc.quality, r.quality);
    slots.set(slot, acc);
  }
  return [...slots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, acc]) => ({
      t: slot + bucketMs / 2,
      t0: slot,
      t1: slot + bucketMs,
      rate: acc.observed > 0 ? acc.tokens / (acc.observed / 3_600_000) : 0,
      quality: acc.quality,
    }));
}

export interface SessionPoint {
  t: number;
  used: number;
  pct: number;
}

/**
 * The current 5-hour window's readings, taken straight from the counter rather
 * than accumulated from deltas — inside one window the counter IS the series.
 */
export async function sessionSeries(
  db: SQLite.SQLiteDatabase,
  profile: string,
  sessionResetAt: number,
): Promise<SessionPoint[]> {
  const rows = await db.getAllAsync<{ observed_at: number; session_used: number; session_pct: number }>(
    `SELECT observed_at, session_used, session_pct
       FROM samples
      WHERE profile = ? AND session_reset = ?
      ORDER BY observed_at`,
    [profile, sessionResetAt],
  );
  return rows.map((r) => ({ t: r.observed_at, used: r.session_used, pct: r.session_pct }));
}

export async function latestSample(
  db: SQLite.SQLiteDatabase,
  profile: string,
): Promise<SampleRow | null> {
  return db.getFirstAsync<SampleRow>(
    'SELECT * FROM samples WHERE profile = ? ORDER BY observed_at DESC LIMIT 1',
    [profile],
  );
}

export async function recentSamples(
  db: SQLite.SQLiteDatabase,
  profile: string,
  limit = 30,
): Promise<Pick<SampleRow, 'received_at' | 'server_time'>[]> {
  return db.getAllAsync<Pick<SampleRow, 'received_at' | 'server_time'>>(
    'SELECT received_at, server_time FROM samples WHERE profile = ? ORDER BY observed_at DESC LIMIT ?',
    [profile, limit],
  );
}

export async function closedWindows(
  db: SQLite.SQLiteDatabase,
  profile: string,
  scope: 'session' | 'weekly',
  limit = 12,
): Promise<WindowRow[]> {
  return db.getAllAsync<WindowRow>(
    `SELECT * FROM windows WHERE profile = ? AND scope = ?
      ORDER BY reset_at DESC LIMIT ?`,
    [profile, scope, limit],
  );
}

export interface Coverage {
  sampleCount: number;
  intervalCount: number;
  observedSec: number;
  spanSec: number;
  /** 0-1 of the requested span we were actually observing. */
  fraction: number;
  unattributedTokens: number;
  gapCount: number;
  firstAt: number | null;
  lastAt: number | null;
}

/**
 * The data-quality footer's source. Not optional decoration — it is what makes
 * every chart above it trustworthy.
 */
export async function coverage(
  db: SQLite.SQLiteDatabase,
  profile: string,
  sinceMs: number,
  nowMs: number,
): Promise<Coverage> {
  const agg = await db.getFirstAsync<{
    n: number;
    observed_ms: number;
    unattributed: number;
    gaps: number;
    first_at: number | null;
    last_at: number | null;
  }>(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN quality < 2 THEN dt_ms ELSE 0 END), 0) AS observed_ms,
            COALESCE(SUM(CASE WHEN quality = 2 THEN d_weekly ELSE 0 END), 0) AS unattributed,
            COALESCE(SUM(CASE WHEN quality = 2 THEN 1 ELSE 0 END), 0) AS gaps,
            MIN(t0) AS first_at, MAX(t1) AS last_at
       FROM deltas WHERE profile = ? AND t1 >= ?`,
    [profile, sinceMs],
  );
  const samples = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM samples WHERE profile = ? AND observed_at >= ?',
    [profile, sinceMs],
  );
  const spanSec = Math.max(1, (nowMs - sinceMs) / 1000);
  const observedSec = (agg?.observed_ms ?? 0) / 1000;
  return {
    sampleCount: samples?.n ?? 0,
    intervalCount: agg?.n ?? 0,
    observedSec,
    spanSec,
    fraction: Math.min(1, observedSec / spanSec),
    unattributedTokens: agg?.unattributed ?? 0,
    gapCount: agg?.gaps ?? 0,
    firstAt: agg?.first_at ?? null,
    lastAt: agg?.last_at ?? null,
  };
}

/**
 * This week to date against last week over the SAME elapsed fraction.
 *
 * Comparing two days of this week against seven of last week always reports
 * about -71% and means nothing. A delta also needs both sides measured, so a
 * poorly-covered prior span yields null rather than "improved from nothing".
 */
export interface WeekComparison {
  current: number;
  prior: number | null;
  pct: number | null;
  fraction: number;
}

export async function weekOverWeek(
  db: SQLite.SQLiteDatabase,
  profile: string,
  weekStart: number,
  weekEnd: number,
  nowMac: number,
): Promise<WeekComparison> {
  const span = Math.max(1, weekEnd - weekStart);
  const fraction = Math.min(1, Math.max(0, (nowMac - weekStart) / span));
  const prevStart = weekStart - span;
  const cutoff = prevStart + fraction * span;

  const cur = await db.getFirstAsync<{ tokens: number }>(
    'SELECT COALESCE(SUM(d_weekly),0) AS tokens FROM deltas WHERE profile = ? AND t1 > ? AND t1 <= ?',
    [profile, weekStart, nowMac],
  );
  const prior = await db.getFirstAsync<{ tokens: number; observed_ms: number }>(
    `SELECT COALESCE(SUM(d_weekly),0) AS tokens,
            COALESCE(SUM(CASE WHEN quality < 2 THEN dt_ms ELSE 0 END),0) AS observed_ms
       FROM deltas WHERE profile = ? AND t1 > ? AND t1 <= ?`,
    [profile, prevStart, cutoff],
  );

  const priorSpan = Math.max(1, cutoff - prevStart);
  const priorCovered = (prior?.observed_ms ?? 0) / priorSpan;
  const priorTokens = priorCovered >= 0.6 ? (prior?.tokens ?? 0) : null;

  return {
    current: cur?.tokens ?? 0,
    prior: priorTokens,
    pct: priorTokens != null && priorTokens > 0 ? ((cur?.tokens ?? 0) - priorTokens) / priorTokens : null,
    fraction,
  };
}

export interface CumulativePoint {
  /** Unique per row — two deltas can land on the same week fraction. */
  id: string;
  /** 0-1 through the week. */
  f: number;
  tokens: number;
}

/** Cumulative curve over elapsed-week-fraction, for the this-week/last-week overlay. */
export async function cumulativeWeek(
  db: SQLite.SQLiteDatabase,
  profile: string,
  start: number,
  end: number,
  until: number,
): Promise<CumulativePoint[]> {
  const span = Math.max(1, end - start);
  const rows = await db.getAllAsync<{ t1: number; d_weekly: number }>(
    'SELECT t1, d_weekly FROM deltas WHERE profile = ? AND t1 > ? AND t1 <= ? ORDER BY t1',
    [profile, start, Math.min(end, until)],
  );
  let acc = 0;
  const out: CumulativePoint[] = [{ id: 'start', f: 0, tokens: 0 }];
  rows.forEach((r, i) => {
    acc += r.d_weekly;
    out.push({ id: `${i}`, f: Math.min(1, (r.t1 - start) / span), tokens: acc });
  });
  return out;
}

/**
 * Implied per-model limit, recovered from `used / (pct / 100)`.
 *
 * The payload gives Opus/Sonnet percentages but no limits. Only samples above
 * 5% are usable — below that the server's own rounding dominates and the
 * implied limit is garbage. The median is taken so one rounding artifact can't
 * move it.
 */
export async function impliedLimit(
  db: SQLite.SQLiteDatabase,
  profile: string,
  model: 'opus' | 'sonnet',
  sinceMs: number,
): Promise<number | null> {
  const usedCol = model === 'opus' ? 'opus_used' : 'sonnet_used';
  const pctCol = model === 'opus' ? 'opus_pct' : 'sonnet_pct';
  const rows = await db.getAllAsync<{ used: number; pct: number }>(
    `SELECT ${usedCol} AS used, ${pctCol} AS pct FROM samples
      WHERE profile = ? AND observed_at >= ? AND ${pctCol} > 5`,
    [profile, sinceMs],
  );
  if (rows.length === 0) return null;
  const limits = rows.map((r) => (r.used / r.pct) * 100).sort((a, b) => a - b);
  return limits[Math.floor(limits.length / 2)];
}

export { QUALITY_FINE };
