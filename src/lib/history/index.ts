/**
 * History facade. A module-level singleton rather than React context, because
 * the recorder runs inside the fetch path and the background task needs the
 * same handle with no tree mounted.
 */
import type * as SQLite from 'expo-sqlite';

import { openHistory } from './schema';

export * from './derive';
export * from './project';
export * from './queries';
export * from './zone';
export { SAMPLE_RETENTION_DAYS, clearHistory, openHistory, openHistorySync, purge, storageBytes } from './schema';
export type { DeltaRow, SampleRow, WindowRow } from './schema';
export { profileKey, recordSample } from './record';
export type { RecordResult } from './record';

let handle: Promise<SQLite.SQLiteDatabase> | null = null;

export function getHistoryDb(): Promise<SQLite.SQLiteDatabase> {
  handle ??= openHistory().catch((e) => {
    handle = null;
    throw e;
  });
  return handle;
}

/** Best-effort — history is an enhancement, never a reason to fail a refresh. */
export async function withHistory<T>(
  fn: (db: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T | null> {
  try {
    return await fn(await getHistoryDb());
  } catch {
    return null;
  }
}
