import { useEffect } from 'react';
import type { UsageResponse } from '@/lib/api';
import { syncLiveActivity, syncWidget } from '@/lib/externals';
import { syncNotifications } from '@/lib/notifications';
import type { Prefs } from '@/lib/settings';

/**
 * Pushes the latest usage snapshot to the home/lock-screen widget, the Live
 * Activity (if enabled), and local notifications. Runs whenever fresh data
 * arrives or a relevant preference changes.
 */
export function useExternalSync(data: UsageResponse | null, prefs: Prefs, ready: boolean) {
  useEffect(() => {
    if (!ready || !data) return;
    syncWidget(data);
    syncLiveActivity(data, prefs.liveActivity);
    syncNotifications(data, prefs.notifications, prefs.threshold);
  }, [data, prefs.liveActivity, prefs.notifications, prefs.threshold, ready]);
}
