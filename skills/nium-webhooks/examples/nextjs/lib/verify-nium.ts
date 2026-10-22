// Generated with: nium-webhooks skill
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
 * Nium does not sign payloads. During client setup Nium is told to add a static header
 * to every webhook. The name is user-chosen (NIUM_WEBHOOK_HEADER, default x-partner-key)
 * and the whole value is compared as-is: no 'Bearer ' parsing. This authenticates the
 * sender only, not the body, and gives no replay protection.
 */
export function verifyNiumRequest(
  headers: Headers,
  secret: string | undefined = process.env.NIUM_WEBHOOK_SECRET,
  headerName: string = process.env.NIUM_WEBHOOK_HEADER || 'x-partner-key'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
