/**
 * App-wide pairing state. Persists the { host, port, token } connection in
 * the device keychain via expo-secure-store.
 */
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Pairing } from './api';

const STORAGE_KEY = 'claude-usage.pairing.v1';

interface PairingContextValue {
  pairing: Pairing | null;
  isLoading: boolean;
  save: (pairing: Pairing) => Promise<void>;
  clear: () => Promise<void>;
}

const PairingContext = createContext<PairingContextValue | undefined>(undefined);

export function PairingProvider({ children }: { children: React.ReactNode }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored) setPairing(JSON.parse(stored) as Pairing);
      } catch {
        // ignore corrupt/missing value
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const save = async (next: Pairing) => {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    setPairing(next);
  };

  const clear = async () => {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    setPairing(null);
  };

  return (
    <PairingContext.Provider value={{ pairing, isLoading, save, clear }}>
      {children}
    </PairingContext.Provider>
  );
}

export function usePairing(): PairingContextValue {
  const ctx = useContext(PairingContext);
  if (!ctx) throw new Error('usePairing must be used within PairingProvider');
  return ctx;
}
