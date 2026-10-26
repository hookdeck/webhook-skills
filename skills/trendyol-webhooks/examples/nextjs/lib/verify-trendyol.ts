// Generated with: trendyol-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the key's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Trendyol does not sign payloads. With authenticationType API_KEY, every request carries
 * the webhook's apiKey as plain text in the x-api-key header; compare the whole value.
 * (Headers.get is case-insensitive.)
 */
export function verifyTrendyolRequest(
  headers: Headers,
  secret: string | undefined = process.env.TRENDYOL_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get('x-api-key');
  return Boolean(received) && safeEqual(received as string, secret);
}
