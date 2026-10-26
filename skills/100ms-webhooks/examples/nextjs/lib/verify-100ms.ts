// Generated with: 100ms-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison of two header values. Hashing both sides gives
 * equal-length buffers, so timingSafeEqual never throws and the secret's length
 * isn't leaked. Header values are latin1 (ByteString); the configured secret is
 * what the user typed (utf8).
 */
function safeEqual(received: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(Buffer.from(received, 'latin1')).digest();
  const b = crypto.createHash('sha256').update(Buffer.from(expected, 'utf8')).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * 100ms does not sign webhooks. You add a secret header in the 100ms dashboard and
 * 100ms sends it on every request. We compare the WHOLE header value (no 'Bearer '
 * parsing or stripping). Headers.get() is case-insensitive.
 */
export function verify100msRequest(
  headers: Headers,
  secret: string | undefined = process.env.HUNDRED_MS_WEBHOOK_SECRET,
  headerName: string = process.env.HUNDRED_MS_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}

// Demo dedupe store. Use a durable store (Redis, DB unique key) in production.
export const seenEventIds = new Set<string>();
