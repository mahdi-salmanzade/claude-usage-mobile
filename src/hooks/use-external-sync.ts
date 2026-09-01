import { useEffect } from 'react';

import type { UsageResponse } from '@/lib/api';
import { syncLiveActivity, syncWidget } from '@/lib/externals';
import { syncNotifications } from '@/lib/notifications';
import type { Prefs } from '@/lib/settings';
import type { LiveMetrics } from './use-analytics';

/**
 * Pushes the latest snapshot outward: the home/lock-screen widget, the Live
 * Activity, and local notifications.
 *
 * The projection is passed in rather than recomputed here so the number the
 * notification quotes is exactly the number on screen.
 */
export function useExternalSync(
  data: UsageResponse | null,
  prefs: Prefs,
  ready: boolean,
  metrics: LiveMetrics | null,
) {
  useEffect(() => {
    if (!ready || !data) return;
    syncWidget(data);
    syncLiveActivity(data, prefs.liveActivity);
    void syncNotifications({
      res: data,
      enabled: prefs.notifications,
      threshold: prefs.threshold,
      projectionAlerts: prefs.projectionAlerts,
      projection: metrics?.session ?? null,
      macStale: metrics?.macStale ?? true,
    });
  }, [
    data,
    prefs.liveActivity,
    prefs.notifications,
    prefs.threshold,
    prefs.projectionAlerts,
    ready,
    metrics,
  ]);
}
