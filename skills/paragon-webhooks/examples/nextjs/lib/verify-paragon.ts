// Generated with: paragon-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

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
 * Paragon does not sign Webhook Destination requests. You add a header (name and value
 * are yours to choose) under "Show more request options". We compare the WHOLE header
 * value with PARAGON_WEBHOOK_SECRET: a "Bearer " prefix is not parsed or stripped.
 * Headers.get() is case-insensitive.
 */
export function verifyParagonRequest(
  headers: Headers,
  secret: string | undefined = process.env.PARAGON_WEBHOOK_SECRET,
  headerName: string = process.env.PARAGON_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
