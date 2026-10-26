// Generated with: rebrandly-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison. Lengths are checked first because timingSafeEqual
 * throws on buffers of unequal length.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Rebrandly does not sign webhooks. The sender adds a header you chose
 * (REBRANDLY_WEBHOOK_HEADER, default "Authorization") whose whole value must equal
 * REBRANDLY_WEBHOOK_SECRET. Compare the whole value: do not strip a "Bearer " prefix.
 */
export function verifyRebrandlyRequest(
  headers: Headers,
  secret: string | undefined = process.env.REBRANDLY_WEBHOOK_SECRET,
  headerName: string = process.env.REBRANDLY_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
