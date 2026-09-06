import { Platform } from 'react-native';
import { effectiveSessionPercentage, hasModelBreakdown, hasTokenCounts, type UsageResponse } from './api';
import { formatCurrency, formatTokens } from './format';
import type { SessionActivityProps } from '@/widgets/session-activity';
import type { SessionWidgetProps } from '@/widgets/session-widget';

/** Status color as a standalone hex (widgets render outside the app's theme). */
function statusHex(used: number): string {
  const remaining = 100 - used;
  if (remaining < 10) return '#E0705A';
  if (remaining < 20) return '#E0A24A';
  return '#5FB87E';
}

function frac(pct: number): number {
  return Math.max(0, Math.min(100, pct)) / 100;
}

function pctText(pct: number): string {
  return `${Math.round(pct)}%`;
}

/** Concise "1h 40m left" / "resets soon". */
function resetShort(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return 'resets soon';
  const totalMin = Math.floor(diff / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function agoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function tokens(used: number, limit: number): string {
  return `${formatTokens(used)} / ${formatTokens(limit)}`;
}

function widgetProps(res: UsageResponse): SessionWidgetProps {
  const u = res.usage;
  if (!u) {
    const empty = {
      hasData: false,
      updated: '',
      sessionFraction: 0, sessionPctText: '—', sessionReset: 'No data yet', sessionTokens: '', sessionAccent: '#8A8A8A',
      weeklyFraction: 0, weeklyPctText: '—', weeklyReset: '', weeklyTokens: '', weeklyAccent: '#8A8A8A',
      opusFraction: 0, opusPctText: '—', opusTokens: '', opusAccent: '#8A8A8A',
      sonnetFraction: 0, sonnetPctText: '—', sonnetTokens: '', sonnetAccent: '#8A8A8A',
      hasCost: false, costText: '', costFraction: 0,
    } satisfies SessionWidgetProps;
    return empty;
  }
  const hasCost = u.costUsed != null && u.costLimit != null && u.costLimit > 0;
  // Mirror the Mac's `effectiveSessionPercentage`: once the window has rolled
  // its own UI reads 0%, and a widget still showing 87% contradicts it.
  const sessionPct = effectiveSessionPercentage(u);
  // Codex reports percentages only — every token count is 0 by design, so a
  // "0 / 0" row would be a fabricated fact rather than a missing one.
  const showTokens = hasTokenCounts(res);
  const showModels = hasModelBreakdown(res);
  return {
    hasData: true,
    updated: agoShort(u.lastUpdated),

    sessionFraction: frac(sessionPct),
    sessionPctText: pctText(sessionPct),
    sessionReset: resetShort(u.sessionResetTime),
    sessionTokens: showTokens ? tokens(u.sessionTokensUsed, u.sessionLimit) : '',
    sessionAccent: statusHex(sessionPct),

    weeklyFraction: frac(u.weeklyPercentage),
    weeklyPctText: pctText(u.weeklyPercentage),
    weeklyReset: resetShort(u.weeklyResetTime),
    weeklyTokens: showTokens ? tokens(u.weeklyTokensUsed, u.weeklyLimit) : '',
    weeklyAccent: statusHex(u.weeklyPercentage),

    opusFraction: frac(u.opusWeeklyPercentage),
    opusPctText: pctText(u.opusWeeklyPercentage),
    opusTokens: showModels ? `${formatTokens(u.opusWeeklyTokensUsed)} · ${pctText(u.opusWeeklyPercentage)}` : '',
    opusAccent: statusHex(u.opusWeeklyPercentage),

    sonnetFraction: frac(u.sonnetWeeklyPercentage),
    sonnetPctText: pctText(u.sonnetWeeklyPercentage),
    sonnetTokens: showModels ? `${formatTokens(u.sonnetWeeklyTokensUsed)} · ${pctText(u.sonnetWeeklyPercentage)}` : '',
    sonnetAccent: statusHex(u.sonnetWeeklyPercentage),

    hasCost,
    costText: hasCost ? `${formatCurrency(u.costUsed!, u.costCurrency ?? 'USD')} / ${formatCurrency(u.costLimit!, u.costCurrency ?? 'USD')}` : '',
    costFraction: hasCost ? frac((u.costUsed! / u.costLimit!) * 100) : 0,
  };
}

function activityProps(res: UsageResponse): SessionActivityProps | null {
  const u = res.usage;
  if (!u) return null;
  const sessionPct = effectiveSessionPercentage(u);
  return {
    sessionPctText: pctText(sessionPct),
    sessionFraction: frac(sessionPct),
    sessionReset: resetShort(u.sessionResetTime),
    sessionTokens: hasTokenCounts(res) ? tokens(u.sessionTokensUsed, u.sessionLimit) : '',
    weeklyText: `Week ${pctText(u.weeklyPercentage)}`,
    modelsText: hasModelBreakdown(res)
      ? `Opus ${pctText(u.opusWeeklyPercentage)} · Sonnet ${pctText(u.sonnetWeeklyPercentage)}`
      : (u.planType ?? ''),
    accent: statusHex(sessionPct),
  };
}

// Lazy-loaded native widget modules (importing them registers the widgets).
let widget: { updateSnapshot: (p: SessionWidgetProps) => void } | null = null;
let activityFactory: {
  start: (p: SessionActivityProps) => ActivityInstance;
  getInstances: () => ActivityInstance[];
} | null = null;

interface ActivityInstance {
  update: (p: SessionActivityProps) => Promise<void>;
  end: (policy?: 'default' | 'immediate') => Promise<void>;
}

let activity: ActivityInstance | null = null;

function ensureNative(): boolean {
  if (Platform.OS !== 'ios') return false;
  if (!widget) {
    try {
      // Native registration must remain lazy and iOS-only.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      widget = require('@/widgets/session-widget').default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      activityFactory = require('@/widgets/session-activity').default;
    } catch {
      return false;
    }
  }
  return !!widget;
}

/** Push the latest usage into the home/lock-screen widget. */
export function syncWidget(res: UsageResponse) {
  if (!ensureNative() || !widget) return;
  try {
    widget.updateSnapshot(widgetProps(res));
  } catch {
    /* native not available */
  }
}

/** Start/update/end the Live Activity based on the user's preference. */
export async function syncLiveActivity(res: UsageResponse, enabled: boolean) {
  if (!ensureNative() || !activityFactory) return;
  const props = activityProps(res);

  if (!enabled || !props) {
    await endLiveActivity();
    return;
  }

  try {
    if (!activity) {
      activity = activityFactory.getInstances()[0] ?? activityFactory.start(props);
    }
    await activity.update(props);
  } catch {
    activity = null;
  }
}

export async function endLiveActivity() {
  if (!ensureNative() || !activityFactory) return;
  try {
    for (const inst of activityFactory.getInstances()) {
      await inst.end('immediate');
    }
  } catch {
    /* ignore */
  }
  activity = null;
}
