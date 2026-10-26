// Generated with: rapidapi-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison of two strings. Lengths are checked first so
 * timingSafeEqual never throws on unequal-length buffers.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * RapidAPI Enterprise Hub does not sign payloads. Every event request carries the hub's
 * webhook secret key as plain text in the x-rapidapi-webhook-secret header. Compare the
 * WHOLE header value with the key you configured.
 */
export function verifyRapidApiRequest(
  headers: Headers,
  secret: string | undefined = process.env.RAPIDAPI_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get('x-rapidapi-webhook-secret');
  return Boolean(received) && safeEqual(received as string, secret);
}
