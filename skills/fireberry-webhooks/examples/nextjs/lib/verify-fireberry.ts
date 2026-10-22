// Generated with: fireberry-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Lengths are checked first because timingSafeEqual
 * throws on unequal lengths; both sides are compared as equal-length Buffers.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Fireberry does not sign requests. The webhook automation action sends whatever
 * Header key/value pairs you configured, so the header name is user-chosen. Compare
 * the WHOLE value (do not strip a "Bearer " prefix). A static shared credential
 * authenticates the sender, not the body, and offers no replay protection.
 */
export function verifyFireberryRequest(
  headers: Headers,
  secret: string | undefined = process.env.FIREBERRY_WEBHOOK_SECRET,
  headerName: string = process.env.FIREBERRY_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
