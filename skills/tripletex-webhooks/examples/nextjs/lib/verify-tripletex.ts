// Generated with: tripletex-webhooks skill
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
 * Tripletex does not sign payloads. If you set authHeaderName / authHeaderValue on the
 * event subscription, Tripletex sends that header as-is on every callback. Compare the
 * WHOLE value (do not strip or parse a "Bearer " prefix).
 */
export function verifyTripletexRequest(
  headers: Headers,
  secret: string | undefined = process.env.TRIPLETEX_WEBHOOK_SECRET,
  headerName: string = process.env.TRIPLETEX_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
