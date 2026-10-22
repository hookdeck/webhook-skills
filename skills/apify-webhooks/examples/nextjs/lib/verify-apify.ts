// Generated with: apify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Lengths are checked first because
 * timingSafeEqual throws on buffers of different lengths.
 */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Apify does not sign payloads. Authenticate with a secret header added through the
 * webhook's Headers template. The header name is user-chosen (APIFY_WEBHOOK_HEADER) and
 * the whole value is compared as-is (APIFY_WEBHOOK_SECRET), including any "Bearer " prefix.
 *
 * This authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyApifyRequest(
  headers: Headers,
  secret: string | undefined = process.env.APIFY_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const name = process.env.APIFY_WEBHOOK_HEADER || 'X-Webhook-Secret';
  const received = headers.get(name); // Headers lookups are case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
