import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState } from 'react';

const KEY = 'claude-usage.prefs.v1';

export interface Prefs {
  liveActivity: boolean;
  notifications: boolean;
  /** Notify when session usage first crosses this percentage. */
  threshold: number;
}

const DEFAULTS: Prefs = { liveActivity: false, notifications: false, threshold: 80 };

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
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const update = async (patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  return <SettingsContext.Provider value={{ prefs, ready, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
