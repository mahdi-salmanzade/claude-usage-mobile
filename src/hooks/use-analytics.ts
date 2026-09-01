import { useMemo } from 'react';

import type { ClaudeUsage } from '@/lib/api';
import {
  type Coverage,
  type CumulativePoint,
  type DayBucket,
  type HourBucket,
  type Projection,
  type RateSample,
  type SessionPoint,
  type WeekComparison,
  type WindowRow,
  TAU_DISPLAY_MS,
  TAU_PROJECT_MS,
  burnRate,
  capWindow,
  clockSkew,
  closedWindows,
  coverage,
  cumulativeWeek,
  dayBuckets,
  dayKeyOf,
  hourProfile,
  intervalsSince,
  latestSample,
  projectWindow,
  rateSamples,
  recentSamples,
  sessionSeries,
  shiftDayKey,
  sustainablePace,
  weekOverWeek,
} from '@/lib/history';
import { type Range, RANGE_DAYS, useHistoryQuery } from './use-history';

export interface LiveMetrics {
  /** The phone's clock translated into the Mac's frame. */
  nowMac: number;
  skewMs: number;
  /** When the Mac itself last refreshed — distinct from when the phone polled. */
  lastObservedAt: number | null;
  macStale: boolean;
  burnDisplay: number | null;
  burnProject: number | null;
  session: Projection;
  weekly: Projection;
  /** Rendered as a range when the fast and slow estimates disagree. */
  capRange: [number, number] | null;
  sessionPace: number | null;
  dailyPace: number | null;
  sessionPoints: SessionPoint[];
  sessionWindowStart: number | null;
}

/**
 * The derived numbers the Overview leads with.
 *
 * Everything is computed in the MAC's clock frame. Skew cancels inside any
 * delta, so the phone's clock is converted exactly once, here.
 */
export function useLiveMetrics(
  profile: string | null,
  revision: number,
  usage: ClaudeUsage | null,
  now: number,
): LiveMetrics | null {
  const sessionReset = usage ? Date.parse(usage.sessionResetTime) : 0;
  const weeklyReset = usage ? Date.parse(usage.weeklyResetTime) : 0;

  const q = useHistoryQuery(
    async (db) => {
      if (!profile) return null;
      const [skewRows, last, intervals, points, windows] = await Promise.all([
        recentSamples(db, profile, 30),
        latestSample(db, profile),
        intervalsSince(db, profile, now - 6 * 3_600_000),
        sessionReset ? sessionSeries(db, profile, sessionReset) : Promise.resolve([]),
        closedWindows(db, profile, 'session', 1),
      ]);
      return { skewRows, last, intervals, points, windows };
    },
    [profile, revision, sessionReset, Math.floor(now / 60_000)],
    !!profile && !!usage,
  );

  return useMemo(() => {
    if (!usage || !q.data) return null;
    const { skewRows, last, intervals, points, windows } = q.data;

    const skewMs = clockSkew(skewRows);
    const nowMac = now - skewMs;
    const lastObservedAt = last?.observed_at ?? null;
    const macStale = lastObservedAt == null || nowMac - lastObservedAt > 15 * 60_000;

    const burnDisplay = lastObservedAt
      ? burnRate(intervals, TAU_DISPLAY_MS, nowMac, lastObservedAt)
      : null;
    const burnProject = lastObservedAt
      ? burnRate(intervals, TAU_PROJECT_MS, nowMac, lastObservedAt)
      : null;

    const session = projectWindow(
      usage.sessionTokensUsed,
      usage.sessionLimit,
      sessionReset,
      burnProject,
      nowMac,
    );
    const sessionFast = projectWindow(
      usage.sessionTokensUsed,
      usage.sessionLimit,
      sessionReset,
      burnDisplay,
      nowMac,
    );
    const weekly = projectWindow(
      usage.weeklyTokensUsed,
      usage.weeklyLimit,
      weeklyReset,
      burnProject,
      nowMac,
    );

    // The window's start is the predecessor's reset when we saw it roll;
    // otherwise the nominal 5h back from this window's reset.
    const prior = windows.find((w) => w.reset_at === sessionReset);
    const sessionWindowStart = prior?.started_at ?? (sessionReset ? sessionReset - 5 * 3_600_000 : null);

    return {
      nowMac,
      skewMs,
      lastObservedAt,
      macStale,
      burnDisplay,
      burnProject,
      session,
      weekly,
      capRange: capWindow(session, sessionFast),
      sessionPace: sustainablePace(usage.sessionTokensUsed, usage.sessionLimit, sessionReset, nowMac),
      dailyPace: usage.weeklyLimit > 0 ? usage.weeklyLimit / 7 : null,
      sessionPoints: points,
      sessionWindowStart,
    };
  }, [q.data, usage, now, sessionReset, weeklyReset]);
}

export interface AnalyticsData {
  days: DayBucket[];
  hours: HourBucket[];
  rates: RateSample[];
  windows: WindowRow[];
  week: WeekComparison;
  currentWeek: CumulativePoint[];
  priorWeek: CumulativePoint[];
  coverage: Coverage;
}

/** Everything the Analytics screen plots, for one range. */
export function useAnalytics(
  profile: string | null,
  revision: number,
  usage: ClaudeUsage | null,
  range: Range,
  now: number,
) {
  const days = RANGE_DAYS[range];
  const tz = usage?.userTimezone?.identifier ?? 'UTC';
  const weeklyReset = usage ? Date.parse(usage.weeklyResetTime) : 0;

  return useHistoryQuery<AnalyticsData | null>(
    async (db) => {
      if (!profile) return null;
      const from = now - days * 86_400_000;
      const sinceDayKey = shiftDayKey(dayKeyOf(now, tz), -(days - 1));
      // The Anthropic week is anchored to the plan cycle, never to Monday
      // midnight, so its bounds come from the observed reset.
      const weekEnd = weeklyReset || now;
      const weekStart = weekEnd - 7 * 86_400_000;

      const [dayRows, hourRows, rates, windows, week, currentWeek, priorWeek, cov] = await Promise.all([
        dayBuckets(db, profile, sinceDayKey),
        hourProfile(db, profile, shiftDayKey(dayKeyOf(now, tz), -13)),
        // 24h keeps raw intervals; wider ranges aggregate so the steps stay legible.
        rateSamples(db, profile, from, days <= 1 ? 0 : days <= 7 ? 3_600_000 : 6 * 3_600_000),
        closedWindows(db, profile, 'session', 12),
        weekOverWeek(db, profile, weekStart, weekEnd, now),
        cumulativeWeek(db, profile, weekStart, weekEnd, now),
        cumulativeWeek(db, profile, weekStart - 7 * 86_400_000, weekStart, now),
        coverage(db, profile, from, now),
      ]);

      return {
        days: dayRows,
        hours: hourRows,
        rates,
        windows,
        week,
        currentWeek,
        priorWeek,
        coverage: cov,
      };
    },
    [profile, revision, range, tz, weeklyReset, Math.floor(now / 60_000)],
    !!profile,
  );
}
