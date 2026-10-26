// Generated with: clickatell-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Clickatell One API callbacks are unsigned. Authenticate with the Custom Security Header you
 * added to the callback URL: the header name is yours (CLICKATELL_WEBHOOK_HEADER, default
 * Authorization) and the expected value is the exact, whole header value, including any
 * "Bearer " prefix. No prefix parsing.
 */
export function verifyClickatellRequest(
  headers: Headers,
  name: string = process.env.CLICKATELL_WEBHOOK_HEADER || 'Authorization',
  expected: string | undefined = process.env.CLICKATELL_WEBHOOK_SECRET
): boolean {
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers lookup is case-insensitive
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on unequal lengths, so check them first
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
