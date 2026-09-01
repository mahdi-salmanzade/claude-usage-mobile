import { createContext, useContext } from 'react';

import { usePairing } from './pairing';
import { useUsage, type UsageState } from './use-usage';

/**
 * One poller for the whole app.
 *
 * Tabs keep every screen mounted, so calling `useUsage` per screen would run
 * three independent 30-second intervals — three times the requests, and three
 * racing writers into the history recorder.
 */
const UsageContext = createContext<UsageState | undefined>(undefined);

export function UsageProvider({ children }: { children: React.ReactNode }) {
  const { pairing } = usePairing();
  const state = useUsage(pairing);
  return <UsageContext.Provider value={state}>{children}</UsageContext.Provider>;
}

export function useUsageState(): UsageState {
  const ctx = useContext(UsageContext);
  if (!ctx) throw new Error('useUsageState must be used within UsageProvider');
  return ctx;
}
