// Generated with: pingone-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type PingOneAuthConfig = Record<string, string | undefined>;

export interface PingOneEvent {
  id?: string;
  createdAt?: string;
  action?: { type?: string; description?: string };
  actors?: { user?: { id?: string; name?: string } };
  [key: string]: unknown;
}

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * PingOne does not sign subscription webhooks. It sends the headers you set on the
 * subscription (httpEndpoint.headers). Compare the WHOLE header value with the
 * expected one: no Bearer/Basic parsing, because the value is whatever the admin typed.
 * `Headers.get` is case-insensitive.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyPingOneRequest(
  headers: Headers,
  config: PingOneAuthConfig = process.env
): boolean {
  const secret = config.PINGONE_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(config.PINGONE_WEBHOOK_HEADER || 'Authorization');
  if (!received) return false;
  return safeEqual(received, secret);
}

/**
 * ACTIVITY format bodies arrive as a JSON array (JSON_ARRAY, up to 500 events) or as
 * newline-delimited JSON (ND_JSON, one event per line). Returns an array of events.
 */
export function parseEvents(raw: string): PingOneEvent[] {
  const text = raw.trim();
  if (!text) throw new Error('Empty body');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text); // JSON_ARRAY, or ND_JSON with a single line
  } catch {
    parsed = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line)); // ND_JSON
  }
  const events = Array.isArray(parsed) ? parsed : [parsed];
  if (!events.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
    throw new Error('Expected audit event objects');
  }
  return events as PingOneEvent[];
}
