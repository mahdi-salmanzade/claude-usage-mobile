/**
 * Calendar bucketing in the MAC's timezone.
 *
 * Two clocks are in play. `lastUpdated` and every reset time are stamped by the
 * Mac; `Date.now()` is the phone. Calendar buckets belong to the Mac's day —
 * that is where the work happened and how the reset is computed — while clock
 * times shown to the user belong to the phone's zone, because that is the watch
 * they are looking at.
 *
 * `dayKey` and `hour` are resolved ONCE at write time and frozen into the row.
 * Resolving at read time would let a DST change, or moving the Mac, retroactively
 * re-bucket months of history.
 */

export interface Zoned {
  dayKey: string;
  hour: number;
  /** EAST-positive (UTC+2 → +120) — the OPPOSITE sign of Date#getTimezoneOffset. */
  offsetMin: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmtFor(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      // NOT `hour12: false` — that yields '24' at midnight on some ICU builds,
      // which empties bucket 0 and invents a phantom bucket 24.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/** Calendar day + hour of `ms` in `timeZone`. */
export function zoned(ms: number, timeZone: string): Zoned {
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(fmtFor(timeZone).formatToParts(ms).map((p) => [p.type, p.value]));
  } catch {
    // Unknown or renamed zone id — fall back to the device zone rather than
    // dropping an otherwise valid sample.
    parts = Object.fromEntries(
      fmtFor(deviceTimeZone()).formatToParts(ms).map((p) => [p.type, p.value]),
    );
  }
  const hour = Number(parts.hour) % 24;
  const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute));
  // Snap to 15 min: every real UTC offset is a multiple of 15, and rounding
  // absorbs the sub-minute component formatToParts discarded.
  const offsetMin = Math.round((asUtc - ms) / 900_000) * 15;
  return { dayKey, hour, offsetMin };
}

/**
 * Local midnight of a `dayKey`, for chart x-scales.
 *
 * Never `new Date(key)` — that parses YYYY-MM-DD as UTC midnight, which lands
 * on the previous day everywhere west of UTC.
 */
export function dayKeyToMs(key: string, offsetMin: number): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - offsetMin * 60_000;
}

/** `dayKey` of `ms` in `timeZone` — the same string the store froze. */
export function dayKeyOf(ms: number, timeZone: string): string {
  return zoned(ms, timeZone).dayKey;
}

/**
 * Step back `n` whole days from a dayKey. Uses UTC arithmetic on the parsed
 * parts rather than subtracting 86_400_000 from a timestamp: across a DST
 * transition a fixed millisecond step probes one day twice and skips another.
 */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(
    t.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Inclusive list of dayKeys from `from` to `to`. */
export function dayKeyRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  for (let i = 0; i < 400 && cur <= to; i++) {
    out.push(cur);
    cur = shiftDayKey(cur, 1);
  }
  return out;
}
