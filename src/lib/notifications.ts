import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { UsageResponse } from './api';
import { effectiveSessionPercentage } from './api';
import type { Projection } from './history';
import { formatClock, formatDuration } from './format';

const CHANNEL_ID = 'usage';
const THRESHOLD_ID = 'claude-usage.threshold';
const RESET_ID = 'claude-usage.reset';
const PROJECTION_ID = 'claude-usage.projection';

// SDK 57 shape: shouldShowBanner / shouldShowList. `shouldShowAlert` still
// compiles but is deprecated and shows nothing on its own.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let prevSessionPct: number | null = null;
/** The projection alert requires two consecutive confirmations, so a burst of
 * activity can't spam a warning that the next poll retracts. */
let projectionStreak = 0;
let projectionFired = false;

export async function ensureNotificationPermission(): Promise<boolean> {
  // Android 13+ never shows the OS prompt until a channel exists.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Usage alerts',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => {});
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export interface NotificationInputs {
  res: UsageResponse;
  enabled: boolean;
  threshold: number;
  projectionAlerts: boolean;
  projection: Projection | null;
  macStale: boolean;
}

/**
 * Keeps local notifications in sync with the latest usage.
 *
 * Three kinds, in increasing order of usefulness: the window reset (scheduled,
 * so it fires whether or not the app is running), a static threshold crossing,
 * and the projection warning — which is the only one that arrives while there
 * is still time to act on it.
 */
export async function syncNotifications({
  res,
  enabled,
  threshold,
  projectionAlerts,
  projection,
  macStale,
}: NotificationInputs): Promise<void> {
  if (!enabled) {
    await Promise.all([
      cancel(RESET_ID),
      cancel(THRESHOLD_ID),
      cancel(PROJECTION_ID),
    ]);
    prevSessionPct = null;
    projectionStreak = 0;
    projectionFired = false;
    return;
  }

  const u = res.usage;
  if (!u) return;

  const pct = effectiveSessionPercentage(u);

  if (prevSessionPct != null && prevSessionPct < threshold && pct >= threshold) {
    await present(THRESHOLD_ID, 'Claude session running low', `You've used ${Math.round(pct)}% of your 5-hour session.`);
  }
  prevSessionPct = pct;

  // The projection alert. Debounced across two polls, and suppressed entirely
  // when the Mac is stale — a quiet Mac is not evidence of anything.
  if (projectionAlerts && !macStale && projection) {
    if (projection.kind === 'cap-before-reset') {
      projectionStreak++;
      if (projectionStreak >= 2 && !projectionFired) {
        projectionFired = true;
        await present(
          PROJECTION_ID,
          'On pace to hit your session cap',
          `At the current rate you'll run out around ${formatClock(projection.capAt)} — ${formatDuration(
            projection.lockoutMs,
          )} before the window resets.`,
        );
      }
    } else {
      projectionStreak = 0;
      // Re-arm once the pace is safe again, so a later slide re-warns.
      if (projection.kind === 'safe' || projection.kind === 'idle') projectionFired = false;
    }
  }

  // Reschedule the reset notification for the known reset time. Reusing the
  // identifier replaces the pending request rather than stacking a second one.
  const resetDate = new Date(u.sessionResetTime);
  await cancel(RESET_ID);
  if (resetDate.getTime() > Date.now() + 30_000) {
    await Notifications.scheduleNotificationAsync({
      identifier: RESET_ID,
      content: {
        title: 'Claude session reset',
        body: 'Your 5-hour session window has refreshed.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: resetDate },
    }).catch(() => null);
  }
}

async function present(identifier: string, title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body },
    trigger: null,
  }).catch(() => null);
}

async function cancel(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
}
