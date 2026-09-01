/**
 * Synchronous mirror of `recordSample`, for the headless background task.
 *
 * The classification rules live in `derive.ts` and are shared; only the SQLite
 * calls differ. A background runner can be expired at any moment, so nothing
 * here awaits.
 */
import type * as SQLite from 'expo-sqlite';

import type { UsageResponse } from '@/lib/api';
import { KIND_BASELINE, QUALITY_FINE, QUALITY_UNATTRIBUTED, counterDelta, qualityFor, splitFractions } from './derive';
import type { SampleRow } from './schema';
import { zoned } from './zone';

const INSERT_SAMPLE = `
INSERT OR IGNORE INTO samples
 (profile,observed_at,received_at,server_time,tz,tz_offset_min,day_key,hour,
  session_used,session_limit,session_pct,session_reset,
  weekly_used,weekly_limit,weekly_pct,weekly_reset,
  opus_used,opus_pct,sonnet_used,sonnet_pct,sonnet_reset,
  design_used,design_pct,fable_used,fable_pct,
  cost_used,cost_limit,cost_currency,overage)
 VALUES (?,?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?)`;

const INSERT_DELTA = `INSERT OR IGNORE INTO deltas VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

export function recordSampleSync(
  db: SQLite.SQLiteDatabase,
  res: UsageResponse,
  profile: string,
  receivedAt: number,
): boolean {
  const u = res.usage;
  if (!res.hasData || !u) return false;

  const observedAt = Date.parse(u.lastUpdated);
  if (!Number.isFinite(observedAt)) return false;
  const serverTime = Date.parse(res.serverTime);

  const prev = db.getFirstSync<SampleRow>(
    'SELECT * FROM samples WHERE profile = ? ORDER BY observed_at DESC LIMIT 1',
    [profile],
  );
  if (prev && observedAt === prev.observed_at) return false;
  if (prev && observedAt < prev.observed_at - 60_000) return false;

  const tz = u.userTimezone?.identifier ?? 'UTC';
  const z = zoned(observedAt, tz);
  const sessionReset = Date.parse(u.sessionResetTime);
  const weeklyReset = Date.parse(u.weeklyResetTime);
  const sonnetReset = u.sonnetWeeklyResetTime ? Date.parse(u.sonnetWeeklyResetTime) : null;

  db.withTransactionSync(() => {
    db.runSync(INSERT_SAMPLE, [
      profile,
      observedAt,
      receivedAt,
      Number.isFinite(serverTime) ? serverTime : receivedAt,
      tz,
      z.offsetMin,
      z.dayKey,
      z.hour,
      u.sessionTokensUsed,
      u.sessionLimit,
      u.sessionPercentage,
      sessionReset,
      u.weeklyTokensUsed,
      u.weeklyLimit,
      u.weeklyPercentage,
      weeklyReset,
      u.opusWeeklyTokensUsed,
      u.opusWeeklyPercentage,
      u.sonnetWeeklyTokensUsed,
      u.sonnetWeeklyPercentage,
      sonnetReset,
      u.designWeeklyTokensUsed ?? 0,
      u.designWeeklyPercentage ?? 0,
      u.fableWeeklyTokensUsed ?? 0,
      u.fableWeeklyPercentage ?? 0,
      u.costUsed ?? null,
      u.costLimit ?? null,
      u.costCurrency ?? null,
      u.overageBalance ?? null,
    ]);

    if (!prev) {
      db.runSync(INSERT_DELTA, [
        profile, observedAt, observedAt, 0, z.dayKey, z.hour, 0, 0, 0, 0,
        KIND_BASELINE, QUALITY_UNATTRIBUTED,
      ]);
      return;
    }

    const dt = observedAt - prev.observed_at;
    const quality = qualityFor(dt);
    const weekly = counterDelta(
      { used: prev.weekly_used, reset: prev.weekly_reset },
      { used: u.weeklyTokensUsed, reset: weeklyReset },
    );
    const opus = counterDelta(
      { used: prev.opus_used, reset: null },
      { used: u.opusWeeklyTokensUsed, reset: null },
    );
    const sonnet = counterDelta(
      { used: prev.sonnet_used, reset: prev.sonnet_reset },
      { used: u.sonnetWeeklyTokensUsed, reset: sonnetReset ?? weeklyReset },
    );
    const session = counterDelta(
      { used: prev.session_used, reset: prev.session_reset },
      { used: u.sessionTokensUsed, reset: sessionReset },
    );

    const parts =
      quality === QUALITY_FINE && prev.day_key !== z.dayKey
        ? (() => {
            const [y, m, d] = z.dayKey.split('-').map(Number);
            const midnight = Date.UTC(y, m - 1, d) - z.offsetMin * 60_000;
            const f = splitFractions(prev.observed_at, observedAt, midnight);
            return [
              { dayKey: prev.day_key, hour: prev.hour, f: f.before },
              { dayKey: z.dayKey, hour: z.hour, f: f.after },
            ].filter((p) => p.f > 0);
          })()
        : [{ dayKey: z.dayKey, hour: z.hour, f: 1 }];

    for (const part of parts) {
      db.runSync(INSERT_DELTA, [
        profile,
        observedAt,
        prev.observed_at,
        Math.round(dt * part.f),
        part.dayKey,
        part.hour,
        Math.round(weekly.tokens * part.f),
        Math.round(opus.tokens * part.f),
        Math.round(sonnet.tokens * part.f),
        Math.round(session.tokens * part.f),
        weekly.kind,
        quality,
      ]);
    }
  });

  return true;
}
