/**
 * Wire contract + networking for the Claude Usage companion server.
 * Mirrors the `/v1/usage` envelope served by LocalServerService on the Mac.
 */

export interface ClaudeUsage {
  sessionTokensUsed: number;
  sessionLimit: number;
  sessionPercentage: number;
  sessionResetTime: string; // ISO-8601

  weeklyTokensUsed: number;
  weeklyLimit: number;
  weeklyPercentage: number;
  weeklyResetTime: string;

  opusWeeklyTokensUsed: number;
  opusWeeklyPercentage: number;

  sonnetWeeklyTokensUsed: number;
  sonnetWeeklyPercentage: number;
  sonnetWeeklyResetTime?: string | null;

  costUsed?: number | null;
  costLimit?: number | null;
  costCurrency?: string | null;

  overageBalance?: number | null;
  overageBalanceCurrency?: string | null;

  lastUpdated: string;
  userTimezone: { identifier: string };
}

export interface UsageResponse {
  apiVersion: string;
  serverTime: string;
  profileName?: string | null;
  hasData: boolean;
  usage: ClaudeUsage | null;
}

export interface Pairing {
  host: string;
  port: number;
  token: string;
}

export const API_VERSION = 'v1';

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

/** Verify host/port/token are valid. Used during pairing. */
export async function ping(pairing: Pairing): Promise<boolean> {
  const res = await request(pairing, '/ping');
  if (res.status === 401) throw new ApiError('Pairing token was rejected.', 'unauthorized');
  if (!res.ok) throw new ApiError(`Server responded ${res.status}.`, 'server');
  const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
  return json?.ok === true;
}

export async function fetchUsage(pairing: Pairing): Promise<UsageResponse> {
  const res = await request(pairing, '/usage');
  if (res.status === 401) throw new ApiError('Pairing token was rejected. Re-pair from your Mac.', 'unauthorized');
  if (!res.ok) throw new ApiError(`Server responded ${res.status}.`, 'server');
  const json = (await res.json().catch(() => null)) as UsageResponse | null;
  if (!json || typeof json.hasData !== 'boolean') {
    throw new ApiError('Unexpected response from server.', 'bad_response');
  }
  return json;
}

/**
 * Parses a scanned/typed pairing payload: {"v":1,"host":"...","port":47600,"token":"..."}.
 * Returns null if it isn't a valid Claude Usage pairing code.
 */
export function parsePairingPayload(raw: string): Pairing | null {
  try {
    const obj = JSON.parse(raw);
    if (
      typeof obj?.host === 'string' &&
      typeof obj?.port === 'number' &&
      typeof obj?.token === 'string' &&
      obj.host.length > 0 &&
      obj.token.length > 0
    ) {
      return { host: obj.host, port: obj.port, token: obj.token };
    }
  } catch {
    // not JSON
  }
  return null;
}
