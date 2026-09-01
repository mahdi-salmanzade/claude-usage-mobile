/** Display formatting helpers. */

export function formatTokens(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${v}`;
}

/** Tokens per hour, for the burn-rate readouts. */
export function formatRate(perHour: number): string {
  return `${formatTokens(perHour)}/h`;
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatPercent(pct: number): string {
  return `${Math.round(pct)}%`;
}

/** "2h 30m", "3d 1h", "12m". Empty string for a non-positive duration. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** "resets in 2h 30m", "resets in 3d 1h", or "window ended". */
export function relativeReset(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '';
  const diffMs = target - Date.now();
  if (diffMs <= 0) return 'window ended';
  return `resets in ${formatDuration(diffMs)}`;
}

/** "Updated 12s ago", "Updated 3m ago". */
export function relativeUpdated(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return '';
  return `Updated ${shortAgo(diffMs)}`;
}

export function shortAgo(diffMs: number): string {
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/**
 * Wall-clock time in the PHONE's zone. Clock times belong to the watch the user
 * is looking at, even though calendar buckets belong to the Mac's day.
 */
export function formatClock(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(11, 16);
  }
}

export function formatHour(hour: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(
      Date.UTC(2000, 0, 1, hour) + new Date(2000, 0, 1).getTimezoneOffset() * 60_000,
    );
  } catch {
    return `${hour}`;
  }
}

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Weekday initial for a `YYYY-MM-DD` key, parsed as a local date (never `new Date(key)`). */
export function weekdayInitial(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return WEEKDAY[new Date(y, m - 1, d).getDay()];
}

/** "Aug 19" for a `YYYY-MM-DD` key. */
export function formatMonthDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
      new Date(y, m - 1, d),
    );
  } catch {
    return `${m}/${d}`;
  }
}

/** "Wed, Aug 19" for a scrub header. */
export function formatDayDetail(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(y, m - 1, d));
  } catch {
    return dayKey;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Color for a usage percentage, matching the Mac app's battery semantics. */
export function statusColor(percentUsed: number): string {
  const remaining = 100 - percentUsed;
  if (remaining < 10) return '#FF453A';
  if (remaining < 20) return '#FF9F0A';
  return '#30D158';
}
