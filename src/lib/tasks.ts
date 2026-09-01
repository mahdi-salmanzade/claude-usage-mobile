/**
 * Background refresh.
 *
 * Imported for its side effect at the top of the root layout: `defineTask` must
 * have run before the OS ever wakes the task, otherwise TaskManager logs a
 * warning and unregisters it itself — silently deleting the registration.
 *
 * iOS grants these runs opportunistically and often batches them into system
 * windows overnight. `minimumInterval` is a floor, never a schedule, so nothing
 * in the UI may assume a refresh cadence.
 */
import * as BackgroundTask from 'expo-background-task';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

import { fetchUsage, type Pairing } from './api';
import { openHistorySync, profileKey } from './history';
import { recordSampleSync } from './history/record-sync';
import { syncWidget } from './externals';

export const REFRESH_TASK = 'claude-usage.refresh';
const PAIRING_KEY = 'claude-usage.pairing.v1';
const LAST_RUN_KEY = 'claude-usage.bg.lastRun';

TaskManager.defineTask(REFRESH_TASK, async () => {
  try {
    const raw = await SecureStore.getItemAsync(PAIRING_KEY);
    if (!raw) return BackgroundTask.BackgroundTaskResult.Success;
    const pairing = JSON.parse(raw) as Pairing;

    const res = await fetchUsage(pairing);
    const at = Date.now();

    // Synchronous SQLite: there is no UI thread to block in a headless task,
    // and nothing is left half-awaited if iOS expires the runner mid-flight.
    const db = openHistorySync();
    try {
      recordSampleSync(db, res, profileKey(res, pairing), at);
    } finally {
      db.closeSync();
    }

    // Native call into the App Group + WidgetCenter — works with no app UI.
    syncWidget(res);
    await SecureStore.setItemAsync(LAST_RUN_KEY, String(at)).catch(() => {});

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerRefreshTask(minutes = 30): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    // Simulators and Expo Go are always Restricted, and registerTaskAsync would
    // no-op there while appearing to succeed.
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return false;
    await BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: Math.max(15, minutes) });
    return true;
  } catch {
    return false;
  }
}

export async function unregisterRefreshTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(REFRESH_TASK)) {
      await BackgroundTask.unregisterTaskAsync(REFRESH_TASK);
    }
  } catch {
    /* nothing registered */
  }
}

export async function backgroundStatus(): Promise<{
  available: boolean;
  registered: boolean;
  lastRunAt: number | null;
}> {
  const [status, registered, last] = await Promise.all([
    BackgroundTask.getStatusAsync().catch(() => BackgroundTask.BackgroundTaskStatus.Restricted),
    TaskManager.isTaskRegisteredAsync(REFRESH_TASK).catch(() => false),
    SecureStore.getItemAsync(LAST_RUN_KEY).catch(() => null),
  ]);
  const parsed = last ? Number(last) : NaN;
  return {
    available: status === BackgroundTask.BackgroundTaskStatus.Available,
    registered,
    lastRunAt: Number.isFinite(parsed) ? parsed : null,
  };
}
