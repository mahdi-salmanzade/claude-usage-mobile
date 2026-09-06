/**
 * Wire contract + networking for the Claude Usage companion server.
 *
 * Mirrors `LocalServerService.swift` on the Mac field-for-field. Two things
 * about that encoder drive the types here:
 *
 *  - Swift's synthesized `encode(to:)` uses `encodeIfPresent`, so a nil
 *    optional is an ABSENT KEY, never JSON `null`. Every optional below is
 *    `?: T`, not `?: T | null`.
 *  - Dates are `.iso8601` — always UTC `Z`, no fractional seconds
 *    ("2026-09-01T16:00:00Z"). `Date.parse` handles it; a formatter that
 *    demands milliseconds will not.
 */

/** The Mac's `Provider` enum. Only these two identities exist. */
export type ProviderId = 'anthropic' | 'codex';

export interface ClaudeUsage {
  // ── always present ──────────────────────────────────────────────────────
  sessionTokensUsed: number;
  sessionLimit: number;
  sessionPercentage: number;
  sessionResetTime: string;

  weeklyTokensUsed: number;
  weeklyLimit: number;
  weeklyPercentage: number;
  weeklyResetTime: string;

  opusWeeklyTokensUsed: number;
  opusWeeklyPercentage: number;

  sonnetWeeklyTokensUsed: number;
  sonnetWeeklyPercentage: number;

  designWeeklyTokensUsed: number;
  designWeeklyPercentage: number;

  fableWeeklyTokensUsed: number;
  fableWeeklyPercentage: number;

  lastUpdated: string;
  /** An object, not a string — Foundation's `TimeZone: Codable` is keyed. */
  userTimezone: { identifier: string };

  // ── optional: the KEY is omitted when nil ───────────────────────────────
  sonnetWeeklyResetTime?: string;
  designWeeklyResetTime?: string;
  fableWeeklyResetTime?: string;

  costUsed?: number;
  costLimit?: number;
  costCurrency?: string;

  overageBalance?: number;
  overageBalanceCurrency?: string;

  /** Codex plan, an opaque raw string — unknown plans pass through verbatim. */
  planType?: string;
  creditsBalance?: number;
  creditsUnlimited?: boolean;
}

export interface UsageResponse {
  apiVersion: string;
  serverTime: string;
  profileName?: string;
  provider?: ProviderId;
  hasData: boolean;
  /** Omitted entirely when `hasData` is false. */
  usage?: ClaudeUsage;
}

export interface PingResponse {
  ok: boolean;
  app: string;
  apiVersion: string;
}

export interface Pairing {
  host: string;
  port: number;
  token: string;
}

export const API_VERSION = 'v1';
export const DEFAULT_PORT = 47600;

const TIMEOUT_MS = 6000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'unauthorized' | 'network' | 'server' | 'bad_response',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function baseUrl(p: Pairing): string {
  return `http://${p.host}:${p.port}/${API_VERSION}`;
}

async function request(pairing: Pairing, path: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl(pairing)}${path}`, {
      headers: { Authorization: `Bearer ${pairing.token}` },
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('Could not reach your Mac. Is it awake and on the same network?', 'network');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify host/port/token are valid. Used during pairing.
 *
 * The Mac checks auth BEFORE routing, so a wrong token on any path is 401 and
 * an unknown path with a good token is 404 — "401" genuinely means bad token,
 * never "old Mac app".
 */
export async function ping(pairing: Pairing): Promise<PingResponse> {
  const res = await request(pairing, '/ping');
  if (res.status === 401) throw new ApiError('Pairing token was rejected.', 'unauthorized');
  if (!res.ok) throw new ApiError(`Server responded ${res.status}.`, 'server');
  const json = (await res.json().catch(() => null)) as PingResponse | null;
  if (json?.ok !== true) throw new ApiError('That server is not a Claude Usage companion.', 'bad_response');
  return json;
}

export async function fetchUsage(pairing: Pairing): Promise<UsageResponse> {
  const res = await request(pairing, '/usage');
  if (res.status === 401) {
    throw new ApiError('Pairing token was rejected. Re-pair from your Mac.', 'unauthorized');
  }
  if (!res.ok) throw new ApiError(`Server responded ${res.status}.`, 'server');
  const json = (await res.json().catch(() => null)) as UsageResponse | null;
  if (!json || typeof json.hasData !== 'boolean') {
    throw new ApiError('Unexpected response from server.', 'bad_response');
  }
  return json;
}

/** One validation path for manual entry, QR codes, and deep links. */
export function validatePairing(value: Pairing): Pairing | null {
  const host = value.host.trim();
  const token = value.token.trim();
  if (!host || /[\s/@?#]/.test(host) || !token ||
      !Number.isInteger(value.port) || value.port < 1 || value.port > 65535) return null;
  return { host, port: value.port, token };
}

/**
 * Parses a scanned/typed pairing payload: {"v":1,"host":"…","port":47600,"token":"…"}.
 * Returns null if it isn't a pairing code this app understands — including a
 * future `v` it has no way to honour.
 */
export function parsePairingPayload(raw: string): Pairing | null {
  try {
    const obj = JSON.parse(raw);
    if (obj?.v != null && obj.v !== 1) return null;
    if (
      typeof obj?.host === 'string' &&
      typeof obj?.port === 'number' &&
      typeof obj?.token === 'string' &&
      obj.host.length > 0 &&
      obj.token.length > 0
    ) {
      return validatePairing({ host: obj.host, port: obj.port, token: obj.token });
    }
  } catch {
    // not JSON
  }
  return null;
}

/**
 * Mirror of the Mac's `effectiveSessionPercentage`, which is a computed
 * property and never crosses the wire. Once `sessionResetTime` has passed the
 * Mac's own UI reads 0%; without this the phone keeps showing the pre-reset
 * number until the Mac happens to refetch.
 */
export function effectiveSessionPercentage(u: ClaudeUsage, now = Date.now()): number {
  return Date.parse(u.sessionResetTime) < now ? 0 : u.sessionPercentage;
}

/** Codex reports percentages only — every token/limit field is 0 by design. */
export function hasTokenCounts(res: Pick<UsageResponse, 'provider'>): boolean {
  return res.provider !== 'codex';
}

/** Anthropic reports Opus/Sonnet/Design/Fable separately; Codex reports none. */
export function hasModelBreakdown(res: Pick<UsageResponse, 'provider'>): boolean {
  return res.provider !== 'codex';
}

export function providerLabel(provider: ProviderId | undefined): string {
  return provider === 'codex' ? 'OpenAI Codex' : 'Anthropic';
}
