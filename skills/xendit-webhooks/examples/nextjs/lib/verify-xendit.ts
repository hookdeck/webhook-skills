// Generated with: xendit-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the token's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Xendit does not sign the payload (no HMAC). It sends your webhook verification
 * token, unchanged, in the x-callback-token header. Compare it to the token
 * from Dashboard > Settings > Webhooks.
 */
export function verifyXenditToken(
  headers: Headers,
  token: string | undefined = process.env.XENDIT_CALLBACK_TOKEN
): boolean {
  if (!token) return false; // never accept when unconfigured
  const received = headers.get('x-callback-token');
  if (!received) return false;
  return safeEqual(received, token);
}
