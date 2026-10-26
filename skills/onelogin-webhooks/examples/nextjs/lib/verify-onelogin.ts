// Generated with: onelogin-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Checks lengths first (timingSafeEqual throws on
 * unequal lengths), then compares equal-length Buffers.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * OneLogin does not sign Event Broadcaster requests. You add a custom header (any name,
 * any value) to the broadcaster and compare it with the value you stored. The WHOLE
 * header value is compared: a "Bearer " prefix is not stripped or parsed.
 * This is a static shared credential: it authenticates the sender, not the body, and
 * gives no replay protection. Use HTTPS and rotate it if it leaks.
 */
export function verifyOneLoginRequest(
  headers: Headers,
  secret: string | undefined = process.env.ONELOGIN_WEBHOOK_SECRET,
  headerName: string = process.env.ONELOGIN_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}

export type OneLoginEvent = { event_type_id?: number | string; [key: string]: unknown };

function isObject(v: unknown): v is OneLoginEvent {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * The body is a JSON array of events (the JSON Array format type OneLogin recommends; its docs
 * describe no other). Returns an array of event objects, or null if the body isn't valid.
 */
export function parseEvents(raw: string): OneLoginEvent[] | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.every(isObject) ? parsed : null;
    return isObject(parsed) ? [parsed] : null;
  } catch {
    return null;
  }
}
