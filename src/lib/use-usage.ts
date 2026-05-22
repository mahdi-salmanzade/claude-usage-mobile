import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, fetchUsage, type Pairing, type UsageResponse } from './api';

const CACHE_KEY = 'claude-usage.cache.v1';
const POLL_MS = 30_000;

export type ConnState = 'connecting' | 'live' | 'stale' | 'error';

export interface UsageState {
  data: UsageResponse | null;
  conn: ConnState;
  errorMessage: string | null;
  lastFetchedAt: number | null;
  refreshing: boolean;
  refresh: () => void;
}

/**
 * Owns fetching, caching and connection state for one pairing.
 * - Hydrates the last good snapshot from SecureStore so launch shows data
 *   instantly (marked "stale" until a fresh fetch lands).
 * - Polls every 30s, refreshes when the app returns to the foreground.
 * - On failure keeps showing cached data as "stale"; only shows "error" when
 *   there is nothing to show.
 */
export function useUsage(pairing: Pairing | null): UsageState {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [conn, setConn] = useState<ConnState>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const inflight = useRef(false);
  const hasData = useRef(false);

  // Hydrate cached snapshot once.
  useEffect(() => {
    let active = true;
    (async () => {
      const raw = await SecureStore.getItemAsync(CACHE_KEY).catch(() => null);
      if (active && raw) {
        try {
          const cached = JSON.parse(raw) as { data: UsageResponse; at: number };
          setData(cached.data);
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
    };
  }, []);

  const load = useCallback(
    async (manual: boolean) => {
      if (!pairing || inflight.current) return;
      inflight.current = true;
      if (manual) setRefreshing(true);
      try {
        const res = await fetchUsage(pairing);
        const at = Date.now();
        setData(res);
        setLastFetchedAt(at);
        setConn('live');
        setErrorMessage(null);
        hasData.current = res.hasData || hasData.current;
        if (res.hasData) {
          SecureStore.setItemAsync(CACHE_KEY, JSON.stringify({ data: res, at })).catch(() => {});
        }
      } catch (e) {
        setErrorMessage(e instanceof ApiError ? e.message : 'Something went wrong.');
        setConn(hasData.current ? 'stale' : 'error');
      } finally {
        inflight.current = false;
        setRefreshing(false);
      }
    },
    [pairing],
  );

  // Initial load + poll + foreground refresh.
  useEffect(() => {
    if (!pairing) return;
    load(false);
    const id = setInterval(() => load(false), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') load(false);
    });
    return () => {
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
  };
}

/** Clears the cached snapshot (call on unpair). */
export async function clearUsageCache() {
  await SecureStore.deleteItemAsync(CACHE_KEY).catch(() => {});
}
