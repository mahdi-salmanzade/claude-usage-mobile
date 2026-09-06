import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError, fetchUsage, type Pairing, type UsageResponse } from './api';
import { useSettings } from './settings';
import { profileKey, purge, recordSample, withHistory } from './history';

const CACHE_KEY = 'claude-usage.cache.v1';
const POLL_MS = 30_000;
/** Retention runs on a timer, not every poll — it is a whole-table scan. */
const PURGE_EVERY_MS = 60 * 60_000;

export type ConnState = 'connecting' | 'live' | 'stale' | 'error';

export interface UsageState {
  data: UsageResponse | null;
  conn: ConnState;
  errorMessage: string | null;
  lastFetchedAt: number | null;
  refreshing: boolean;
  refresh: () => void;
  /** Bumps whenever a new distinct snapshot lands in history, so charts requery. */
  historyRevision: number;
  invalidateHistory: () => void;
  profile: string | null;
}

/**
 * Owns fetching, caching and connection state for one pairing.
 *
 * - Hydrates the last good snapshot from SecureStore so launch shows data
 *   instantly (marked "stale" until a fresh fetch lands).
 * - Polls every 30s, refreshes when the app returns to the foreground.
 * - On failure keeps showing cached data as "stale"; only shows "error" when
 *   there is nothing to show.
 * - Records each DISTINCT snapshot into the history store. That happens here,
 *   in the fetch path, and not in an effect on `data` — an effect would also
 *   fire for the cache hydration below and replay an hours-old snapshot into
 *   the recorder on every cold start.
 */
export function useUsage(pairing: Pairing | null): UsageState {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [conn, setConn] = useState<ConnState>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [profile, setProfile] = useState<string | null>(null);

  const { prefs } = useSettings();
  const inflight = useRef(false);
  const mounted = useRef(false);
  const fetched = useRef(false);
  const hasData = useRef(false);
  const lastPurge = useRef(0);

  // Hydrate cached snapshot once.
  useEffect(() => {
    let active = true;
    mounted.current = true;
    (async () => {
      const raw = await SecureStore.getItemAsync(CACHE_KEY).catch(() => null);
      if (active && raw && !fetched.current) {
        try {
          const cached = JSON.parse(raw) as { data: UsageResponse; at: number };
          setData(cached.data);
          if (pairing) setProfile(profileKey(cached.data, pairing));
          setLastFetchedAt(cached.at);
          hasData.current = true;
          setConn((c) => (c === 'live' ? c : 'stale'));
        } catch {
          /* ignore corrupt cache */
        }
      }
    })();
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [pairing]);

  const load = useCallback(
    async (manual: boolean) => {
      if (!pairing || inflight.current) return;
      inflight.current = true;
      if (manual) setRefreshing(true);
      try {
        const res = await fetchUsage(pairing);
        if (!mounted.current) return;
        fetched.current = true;
        const at = Date.now();
        setData(res);
        setLastFetchedAt(at);
        setConn('live');
        setErrorMessage(null);
        setProfile(profileKey(res, pairing));
        hasData.current = res.hasData || hasData.current;
        if (res.hasData) {
          SecureStore.setItemAsync(CACHE_KEY, JSON.stringify({ data: res, at })).catch(() => {});
        }

        const result = await withHistory((db) => recordSample(db, res, pairing, at));
        if (result?.inserted) setHistoryRevision((r) => r + 1);
        if (result && at - lastPurge.current > PURGE_EVERY_MS) {
          lastPurge.current = at;
          void withHistory((db) => purge(db, result.profile, at, prefs.retentionDays));
        }
      } catch (e) {
        if (!mounted.current) return;
        setErrorMessage(e instanceof ApiError ? e.message : 'Something went wrong.');
        setConn(hasData.current ? 'stale' : 'error');
      } finally {
        inflight.current = false;
        setRefreshing(false);
      }
    },
    [pairing, prefs.retentionDays],
  );

  // Initial load + poll + foreground refresh.
  useEffect(() => {
    if (!pairing) return;
    // Start asynchronously; load also updates the refresh state for user actions.
    const initial = setTimeout(() => void load(false), 0);
    const id = setInterval(() => load(false), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') load(false);
    });
    return () => {
      clearTimeout(initial);
      clearInterval(id);
      sub.remove();
    };
  }, [pairing, load]);

  return {
    data,
    conn,
    errorMessage,
    lastFetchedAt,
    refreshing,
    refresh: () => load(true),
    historyRevision,
    invalidateHistory: () => setHistoryRevision((r) => r + 1),
    profile,
  };
}

/** Clears the cached snapshot (call on unpair). */
export async function clearUsageCache() {
  await SecureStore.deleteItemAsync(CACHE_KEY).catch(() => {});
}
