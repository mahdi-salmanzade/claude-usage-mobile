/** Display formatting helpers. */

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** "resets in 2h 30m", "resets in 3d 1h", or "window ended". */
export function relativeReset(iso: string): string {
  const target = new Date(iso).getTime();
  const diffMs = target - Date.now();
  if (Number.isNaN(target)) return '';
  if (diffMs <= 0) return 'window ended';

  const totalMin = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;

  if (days > 0) return `resets in ${days}d ${hours}h`;
  if (hours > 0) return `resets in ${hours}h ${mins}m`;
  return `resets in ${mins}m`;
}

/** "Updated 12s ago", "Updated 3m ago". */
export function relativeUpdated(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return '';
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `Updated ${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `Updated ${min}m ago`;
  const hr = Math.floor(min / 60);
  return `Updated ${hr}h ago`;
}

/** Color for a usage percentage, matching the Mac app's battery semantics. */
export function statusColor(percentUsed: number): string {
  const remaining = 100 - percentUsed;
  if (remaining < 10) return '#FF453A'; // critical
  if (remaining < 20) return '#FF9F0A'; // moderate
  return '#30D158'; // safe
}
