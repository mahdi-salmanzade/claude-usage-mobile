import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { registerRefreshTask, unregisterRefreshTask } from './tasks';

const KEY = 'claude-usage.prefs.v2';

export interface Prefs {
  liveActivity: boolean;
  notifications: boolean;
  /** Notify when session usage first crosses this percentage. */
  threshold: number;
  /**
   * Notify when the projection says the cap arrives before the reset. Far more
   * useful than a static level: it fires while there is still time to change
   * what you're doing.
   */
  projectionAlerts: boolean;
  /** Opportunistic refresh so history and widgets survive the app being closed. */
  backgroundRefresh: boolean;
  /** Days of raw samples to keep. Rollups outlive this. */
  retentionDays: number;
}

const DEFAULTS: Prefs = {
  liveActivity: false,
  notifications: false,
  threshold: 80,
  projectionAlerts: true,
  backgroundRefresh: false,
  retentionDays: 14,
};

export const RETENTION_OPTIONS = [7, 14, 30] as const;

interface SettingsValue {
  prefs: Prefs;
  ready: boolean;
  update: (patch: Partial<Prefs>) => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
      } catch {
        /* ignore corrupt prefs */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const update = useCallback(async (patch: Partial<Prefs>) => {
    let next: Prefs | null = null;
    setPrefs((prev) => {
      next = { ...prev, ...patch };
      SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    // Registration is a side effect of the preference, not of a screen, so it
    // stays here rather than in Settings — the toggle means the same thing
    // wherever it is flipped from.
    if (patch.backgroundRefresh !== undefined) {
      if (patch.backgroundRefresh) await registerRefreshTask();
      else await unregisterRefreshTask();
    }
  }, []);

  const value = useMemo(() => ({ prefs, ready, update }), [prefs, ready, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
