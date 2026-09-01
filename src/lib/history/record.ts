/**
 * Recording one poll into history.
 *
 * Called from the fetch path, not from an effect on `data` — an effect also
 * fires for the cached-snapshot hydration, which would replay an hours-old
 * snapshot into the recorder on every cold start.
 */
import type * as SQLite from 'expo-sqlite';

import type { Pairing, UsageResponse } from '@/lib/api';
import {
  KIND_BASELINE,
  QUALITY_FINE,
  QUALITY_UNATTRIBUTED,
  counterDelta,
  qualityFor,
  splitFractions,
} from './derive';
import type { SampleRow } from './schema';
import { zoned } from './zone';

export type RecordResult =
  | { inserted: true; baseline: boolean; profile: string }
  | { inserted: false; reason: 'no-data' | 'duplicate' | 'backwards' | 'bad-timestamp'; profile: string };

/**
 * Which account a row belongs to. Switching Claude accounts on the Mac changes
 * every counter discontinuously, which looks exactly like a reset — partitioning
 * means two accounts can never share a timeline.
 */
export function profileKey(res: UsageResponse, pairing: Pairing): string {
  return res.profileName ?? `${pairing.host}:${pairing.port}`;
}

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

export async function recordSample(
  db: SQLite.SQLiteDatabase,
  res: UsageResponse,
  pairing: Pairing,
  receivedAt: number,
): Promise<RecordResult> {
  const profile = profileKey(res, pairing);
  const u = res.usage;

  // `hasData: false` is a valid observation — the server is up but has never
  // fetched. Different copy from "can't reach your Mac", so keep the distinction.
  if (!res.hasData || !u) {
    await db.runAsync('INSERT OR REPLACE INTO meta VALUES (?, ?)', [
      'last_no_data_at',
      String(receivedAt),
    ]);
    return { inserted: false, reason: 'no-data', profile };
  }

  const observedAt = Date.parse(u.lastUpdated);
  const serverTime = Date.parse(res.serverTime);
  if (!Number.isFinite(observedAt)) return { inserted: false, reason: 'bad-timestamp', profile };

  const prev = await db.getFirstAsync<SampleRow>(
    'SELECT * FROM samples WHERE profile = ? ORDER BY observed_at DESC LIMIT 1',
    [profile],
  );

  // The dedupe that makes everything downstream work.
  if (prev && observedAt === prev.observed_at) return { inserted: false, reason: 'duplicate', profile };
  // NTP corrected the Mac backwards: dropping beats an out-of-order row that
  // every ORDER BY-dependent query assumes cannot exist.
  if (prev && observedAt < prev.observed_at - 60_000) {
    return { inserted: false, reason: 'backwards', profile };
  }

  const tz = u.userTimezone?.identifier ?? 'UTC';
  const z = zoned(observedAt, tz);
  const sessionReset = Date.parse(u.sessionResetTime);
  const weeklyReset = Date.parse(u.weeklyResetTime);
  const sonnetReset = u.sonnetWeeklyResetTime ? Date.parse(u.sonnetWeeklyResetTime) : null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(INSERT_SAMPLE, [
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

    // The first sample of a profile is a BASELINE: on a fresh install
    // `weeklyTokensUsed` might read 2.1M, which is the whole week to date, not
    // something that was just burned. Skipping this puts a spike on install day
    // that never goes away.
    if (!prev) {
      await db.runAsync(INSERT_DELTA, [
        profile,
        observedAt,
        observedAt,
        0,
        z.dayKey,
        z.hour,
        0,
        0,
        0,
        0,
        KIND_BASELINE,
        QUALITY_UNATTRIBUTED,
      ]);
      await touchWindows(db, profile, u, sessionReset, weeklyReset, prev);
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

    // A fine interval that straddles midnight is split so the GROUP BY stays
    // exact with no read-time arithmetic.
    const crossesMidnight = quality === QUALITY_FINE && prev.day_key !== z.dayKey;
    const parts = crossesMidnight
      ? (() => {
          const boundary = midnightBetween(prev, observedAt, tz);
          const f = splitFractions(prev.observed_at, observedAt, boundary);
          return [
            { dayKey: prev.day_key, hour: prev.hour, f: f.before },
            { dayKey: z.dayKey, hour: z.hour, f: f.after },
          ].filter((p) => p.f > 0);
        })()
      : [{ dayKey: z.dayKey, hour: z.hour, f: 1 }];

    for (const part of parts) {
      await db.runAsync(INSERT_DELTA, [
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

    await touchWindows(db, profile, u, sessionReset, weeklyReset, prev);
  });

  return { inserted: true, baseline: !prev, profile };
}

/** Midnight (in the Mac's zone) that falls inside the interval. */
function midnightBetween(prev: SampleRow, observedAt: number, tz: string): number {
  const z = zoned(observedAt, tz);
  const [y, m, d] = z.dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - z.offsetMin * 60_000;
}

/**
 * Keeps one row per observed window, tracking its peak.
 *
 * The window START is not simply `reset - 5h`: Claude's window begins at the
 * first message after the previous one ended, so after an idle stretch
 * `sessionResetTime` can jump forward by more than 5h. When the predecessor's
 * reset was observed, that instant IS this window's start (start_exact = 1).
 */
async function touchWindows(
  db: SQLite.SQLiteDatabase,
  profile: string,
  u: NonNullable<UsageResponse['usage']>,
  sessionReset: number,
  weeklyReset: number,
  prev: SampleRow | null | undefined,
): Promise<void> {
  await upsertWindow(db, profile, 'session', sessionReset, u.sessionTokensUsed, u.sessionPercentage, u.sessionLimit, prev?.session_reset ?? null, 5 * 3_600_000);
  await upsertWindow(db, profile, 'weekly', weeklyReset, u.weeklyTokensUsed, u.weeklyPercentage, u.weeklyLimit, prev?.weekly_reset ?? null, 7 * 86_400_000);

  // Close the predecessor with its last observed value — the counter, not a sum
  // of deltas, so the window total carries no accumulated error.
  if (prev && prev.session_reset < sessionReset) {
    await db.runAsync(
      'UPDATE windows SET final_used = ?, closed = 1 WHERE profile = ? AND scope = ? AND reset_at = ?',
      [prev.session_used, profile, 'session', prev.session_reset],
    );
  }
  if (prev && prev.weekly_reset < weeklyReset) {
    await db.runAsync(
      'UPDATE windows SET final_used = ?, closed = 1 WHERE profile = ? AND scope = ? AND reset_at = ?',
      [prev.weekly_used, profile, 'weekly', prev.weekly_reset],
    );
  }
}

async function upsertWindow(
  db: SQLite.SQLiteDatabase,
  profile: string,
  scope: string,
  resetAt: number,
  used: number,
  pct: number,
  limit: number,
  prevReset: number | null,
  nominalSpan: number,
): Promise<void> {
  if (!Number.isFinite(resetAt)) return;
  const exact = prevReset != null && prevReset < resetAt ? 1 : 0;
  const startedAt = exact ? prevReset! : resetAt - nominalSpan;
  await db.runAsync(
    `INSERT INTO windows (profile,scope,reset_at,started_at,start_exact,peak_used,peak_pct,token_limit,final_used,closed)
     VALUES (?,?,?,?,?,?,?,?,NULL,0)
     ON CONFLICT(profile,scope,reset_at) DO UPDATE SET
       peak_used = MAX(peak_used, excluded.peak_used),
       peak_pct  = MAX(peak_pct,  excluded.peak_pct),
       token_limit = excluded.token_limit,
       started_at  = CASE WHEN start_exact = 0 AND excluded.start_exact = 1
                          THEN excluded.started_at ELSE started_at END,
       start_exact = MAX(start_exact, excluded.start_exact)`,
    [profile, scope, resetAt, startedAt, exact, used, pct, limit],
  );
}
