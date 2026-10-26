// Generated with: connecteam-webhooks skill
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
 * Connecteam does not sign or hash the body. When a secretKey is set on the webhook,
 * it is sent as-is in the x-webhook-secret header. Compare the WHOLE header value.
 * This authenticates the sender only: it says nothing about the body and gives no
 * replay protection.
 */
export function verifyConnecteamRequest(
  headers: Headers,
  secret: string | undefined = process.env.CONNECTEAM_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get('x-webhook-secret'); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
