import * as Notifications from 'expo-notifications';
import type { UsageResponse } from './api';

// Foreground presentation (SDK 56 shape: shouldShowBanner / shouldShowList).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let resetNotifId: string | null = null;
let prevSessionPct: number | null = null;

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return req.granted;
}

/**
 * Keeps local notifications in sync with the latest usage:
 * - fires an immediate alert the first time session usage crosses `threshold`
 * - (re)schedules a "session reset" notification at the known reset time
 */
export async function syncNotifications(res: UsageResponse, enabled: boolean, threshold: number) {
  if (!enabled) {
    if (resetNotifId) {
      await Notifications.cancelScheduledNotificationAsync(resetNotifId).catch(() => {});
      resetNotifId = null;
    }
    prevSessionPct = null;
    return;
  }

  const u = res.usage;
  if (!u) return;

  const pct = u.sessionPercentage;
  if (prevSessionPct != null && prevSessionPct < threshold && pct >= threshold) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Claude session running low',
        body: `You've used ${Math.round(pct)}% of your 5-hour session.`,
      },
      trigger: null,
    }).catch(() => {});
  }
  prevSessionPct = pct;

  // Reschedule the session-reset notification for the known reset time.
  if (resetNotifId) {
    await Notifications.cancelScheduledNotificationAsync(resetNotifId).catch(() => {});
    resetNotifId = null;
  }
  const resetDate = new Date(u.sessionResetTime);
  if (resetDate.getTime() > Date.now() + 30_000) {
    resetNotifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Claude session reset',
        body: 'Your 5-hour session window has refreshed.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: resetDate },
    }).catch(() => null);
  }
}
