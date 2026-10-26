// Generated with: measureone-webhooks skill
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
 * MeasureOne does not sign webhooks. You add a static header to
 * delivery_details[].headers on each Data Request; the header name is yours to choose.
 * Compare the WHOLE header value (do not strip or parse a "Bearer " prefix).
 * This authenticates the sender only: it does not cover the body and gives no replay protection.
 */
export function verifyMeasureOneRequest(
  headers: Headers,
  secret: string | undefined = process.env.MEASUREONE_WEBHOOK_SECRET,
  headerName: string = process.env.MEASUREONE_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
