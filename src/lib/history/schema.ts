/**
 * On-device usage history.
 *
 * The Mac serves a point-in-time snapshot and nothing else, so every chart in
 * this app is built from history the phone accumulates itself: one row per
 * DISTINCT Mac snapshot, plus the classified interval between it and its
 * predecessor.
 *
 * Intervals are classified at INSERT time, while both samples are in hand.
 * Deriving them on read would mean recomputing from a purged history later and
 * silently changing past charts.
 */
import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'usage-history.db';
export const SCHEMA_VERSION = 1;

const DDL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- RAW. One row per distinct Mac snapshot.
-- PK (profile, observed_at) + INSERT OR IGNORE dedupes repeat polls for free.
-- The Mac refreshes far slower than the 30s poll, so most polls repeat a
-- snapshot; without this we would store 20-40x the rows AND create dt=0
-- intervals that divide by zero in the burn rate.
CREATE TABLE IF NOT EXISTS samples (
  profile        TEXT    NOT NULL,
  observed_at    INTEGER NOT NULL,
  received_at    INTEGER NOT NULL,
  server_time    INTEGER NOT NULL,
  tz             TEXT    NOT NULL,
  tz_offset_min  INTEGER NOT NULL,
  day_key        TEXT    NOT NULL,
  hour           INTEGER NOT NULL,
  session_used   INTEGER NOT NULL,
  session_limit  INTEGER NOT NULL,
  session_pct    REAL    NOT NULL,
  session_reset  INTEGER NOT NULL,
  weekly_used    INTEGER NOT NULL,
  weekly_limit   INTEGER NOT NULL,
  weekly_pct     REAL    NOT NULL,
  weekly_reset   INTEGER NOT NULL,
  opus_used      INTEGER NOT NULL,
  opus_pct       REAL    NOT NULL,
  sonnet_used    INTEGER NOT NULL,
  sonnet_pct     REAL    NOT NULL,
  sonnet_reset   INTEGER,
  design_used    INTEGER NOT NULL DEFAULT 0,
  design_pct     REAL    NOT NULL DEFAULT 0,
  fable_used     INTEGER NOT NULL DEFAULT 0,
  fable_pct      REAL    NOT NULL DEFAULT 0,
  cost_used      REAL,
  cost_limit     REAL,
  cost_currency  TEXT,
  overage        REAL,
  PRIMARY KEY (profile, observed_at)
) WITHOUT ROWID;

-- INTERVALS. Every chart reads this table, never \`samples\`.
CREATE TABLE IF NOT EXISTS deltas (
  profile   TEXT    NOT NULL,
  t1        INTEGER NOT NULL,
  t0        INTEGER NOT NULL,
  dt_ms     INTEGER NOT NULL,
  day_key   TEXT    NOT NULL,
  hour      INTEGER NOT NULL,
  d_weekly  INTEGER NOT NULL,
  d_opus    INTEGER NOT NULL,
  d_sonnet  INTEGER NOT NULL,
  d_session INTEGER NOT NULL,
  kind      INTEGER NOT NULL,
  quality   INTEGER NOT NULL,
  PRIMARY KEY (profile, t1, day_key)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ix_deltas_day  ON deltas(profile, day_key);
CREATE INDEX IF NOT EXISTS ix_deltas_t1   ON deltas(profile, t1);
CREATE INDEX IF NOT EXISTS ix_deltas_hour ON deltas(profile, hour) WHERE quality = 0;

-- WINDOWS. One row per observed session/weekly window. Kept forever.
-- \`final_used\` is the AUTHORITATIVE window total: the counter read just before
-- the roll, with none of the error that accumulates in a sum of deltas.
CREATE TABLE IF NOT EXISTS windows (
  profile     TEXT    NOT NULL,
  scope       TEXT    NOT NULL,
  reset_at    INTEGER NOT NULL,
  started_at  INTEGER NOT NULL,
  start_exact INTEGER NOT NULL,
  peak_used   INTEGER NOT NULL,
  peak_pct    REAL    NOT NULL,
  token_limit INTEGER NOT NULL,
  final_used  INTEGER,
  closed      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile, scope, reset_at)
) WITHOUT ROWID;
`;

export interface SampleRow {
  profile: string;
  observed_at: number;
  received_at: number;
  server_time: number;
  tz: string;
  tz_offset_min: number;
  day_key: string;
  hour: number;
  session_used: number;
  session_limit: number;
  session_pct: number;
  session_reset: number;
  weekly_used: number;
  weekly_limit: number;
  weekly_pct: number;
  weekly_reset: number;
  opus_used: number;
  opus_pct: number;
  sonnet_used: number;
  sonnet_pct: number;
  sonnet_reset: number | null;
  design_used: number;
  design_pct: number;
  fable_used: number;
  fable_pct: number;
  cost_used: number | null;
  cost_limit: number | null;
  cost_currency: string | null;
  overage: number | null;
}

export interface DeltaRow {
  profile: string;
  t1: number;
  t0: number;
  dt_ms: number;
  day_key: string;
  hour: number;
  d_weekly: number;
  d_opus: number;
  d_sonnet: number;
  d_session: number;
  kind: number;
  quality: number;
}

export interface WindowRow {
  profile: string;
  scope: 'session' | 'weekly' | 'sonnet';
  reset_at: number;
  started_at: number;
  start_exact: number;
  peak_used: number;
  peak_pct: number;
  token_limit: number;
  final_used: number | null;
  closed: number;
}

/**
 * Runs on every open. `PRAGMA user_version` cannot be parameterized, so the
 * literal is interpolated.
 */
export async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;
  await db.execAsync(DDL);
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export async function openHistory(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  return db;
}

/** Synchronous open for the headless background task (no UI thread to block). */
export function openHistorySync(): SQLite.SQLiteDatabase {
  const db = SQLite.openDatabaseSync(DATABASE_NAME);
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.execSync(DDL);
  db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

/**
 * Retention. Note the sub-select: deleting everything before the cutoff would
 * orphan the oldest survivor — it loses its predecessor, so its first interval
 * silently vanishes and the oldest visible day always reads low. Keep exactly
 * one pre-cutoff watermark row.
 */
const PURGE_SAMPLES = `
DELETE FROM samples
 WHERE profile = ? AND observed_at < ?
   AND observed_at <> (SELECT MAX(observed_at) FROM samples
                        WHERE profile = ? AND observed_at < ?)`;

const PURGE_DELTAS = `DELETE FROM deltas WHERE profile = ? AND t1 < ?`;

export const SAMPLE_RETENTION_DAYS = 14;
export const DELTA_RETENTION_DAYS = 90;

export async function purge(
  db: SQLite.SQLiteDatabase,
  profile: string,
  now = Date.now(),
  sampleDays = SAMPLE_RETENTION_DAYS,
): Promise<void> {
  const sampleCutoff = now - sampleDays * 86_400_000;
  const deltaCutoff = now - DELTA_RETENTION_DAYS * 86_400_000;
  await db.runAsync(PURGE_SAMPLES, [profile, sampleCutoff, profile, sampleCutoff]);
  await db.runAsync(PURGE_DELTAS, [profile, deltaCutoff]);
}

export async function storageBytes(db: SQLite.SQLiteDatabase): Promise<number> {
  const pc = await db.getFirstAsync<{ page_count: number }>('PRAGMA page_count');
  const ps = await db.getFirstAsync<{ page_size: number }>('PRAGMA page_size');
  return (pc?.page_count ?? 0) * (ps?.page_size ?? 0);
}

export async function clearHistory(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('DELETE FROM samples; DELETE FROM deltas; DELETE FROM windows; DELETE FROM meta;');
}
