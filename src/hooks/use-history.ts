import { useEffect, useMemo, useState } from 'react';
import type * as SQLite from 'expo-sqlite';

import { getHistoryDb } from '@/lib/history';

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Runs a history query and re-runs it when `deps` change.
 *
 * Results land through a mounted flag rather than an AbortController — SQLite
 * queries cannot be cancelled, so the only thing to guard is a late resolve
 * writing into an unmounted or superseded render.
 */
export function useHistoryQuery<T>(
  run: (db: SQLite.SQLiteDatabase) => Promise<T>,
  deps: readonly unknown[],
  enabled = true,
): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: enabled, error: null });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      try {
        const db = await getHistoryDb();
        if (!active) return;
        setState((s) => ({ ...s, loading: true }));
        const data = await run(db);
        if (active) setState({ data, loading: false, error: null });
      } catch (e) {
        if (active) setState({ data: null, loading: false, error: e as Error });
      }
    })();
    return () => {
      active = false;
    };
    // `run` is intentionally not a dep: callers pass an inline closure, and the
    // explicit dep list is the contract for when a requery is warranted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return enabled ? state : { data: null, loading: false, error: null };
}

/** A monotonically increasing "now", ticked every `ms`, for countdowns. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export type Range = '24h' | '7d' | '30d';

export const RANGE_DAYS: Record<Range, number> = { '24h': 1, '7d': 7, '30d': 30 };

export function useRangeWindow(range: Range, now: number) {
  return useMemo(() => {
    const days = RANGE_DAYS[range];
    return { days, from: now - days * 86_400_000, to: now };
  }, [range, now]);
}
