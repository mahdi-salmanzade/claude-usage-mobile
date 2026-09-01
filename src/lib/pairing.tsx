/**
 * App-wide pairing state. Persists the { host, port, token } connection in
 * the device keychain via expo-secure-store.
 */
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEFAULT_PORT, type Pairing } from './api';
import { clearUsageCache } from './use-usage';

const STORAGE_KEY = 'claude-usage.pairing.v1';

interface PairingContextValue {
  pairing: Pairing | null;
  isLoading: boolean;
  save: (pairing: Pairing) => Promise<void>;
  clear: () => Promise<void>;
}

const PairingContext = createContext<PairingContextValue | undefined>(undefined);

/**
 * Development-only pairing from the environment.
 *
 * The only real way in is scanning a QR code, and a simulator has no camera —
 * so without this there is no way to open the dashboard on a simulator at all.
 * Set `EXPO_PUBLIC_PAIRING=host:port:token` before `npx expo start`.
 *
 * Guarded by `__DEV__`, so it cannot reach a release build even if the variable
 * is set in the build environment.
 */
function devPairing(): Pairing | null {
  if (!__DEV__) return null;
  const raw = process.env.EXPO_PUBLIC_PAIRING;
  if (!raw) return null;
  const [host, port, ...rest] = raw.split(':');
  const token = rest.join(':');
  if (!host || !token) return null;
  const parsed = Number.parseInt(port ?? '', 10);
  return { host, port: Number.isNaN(parsed) ? DEFAULT_PORT : parsed, token };
}

export function PairingProvider({ children }: { children: React.ReactNode }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored) {
          setPairing(JSON.parse(stored) as Pairing);
        } else {
          setPairing(devPairing());
        }
      } catch {
        // ignore corrupt/missing value
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const save = useCallback(async (next: Pairing) => {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    setPairing(next);
  }, []);

  const clear = useCallback(async () => {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    await clearUsageCache();
    setPairing(null);
  }, []);

  const value = useMemo(
    () => ({ pairing, isLoading, save, clear }),
    [pairing, isLoading, save, clear],
  );
  return <PairingContext.Provider value={value}>{children}</PairingContext.Provider>;
}

export function usePairing(): PairingContextValue {
  const ctx = useContext(PairingContext);
  if (!ctx) throw new Error('usePairing must be used within PairingProvider');
  return ctx;
}
