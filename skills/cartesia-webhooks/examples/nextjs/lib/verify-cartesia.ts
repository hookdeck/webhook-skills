// Generated with: cartesia-webhooks skill
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
 * Cartesia does not sign the payload. It sends the secret you set on the webhook,
 * raw with no prefix, in the x-webhook-secret header of every delivery.
 */
export function verifyCartesiaRequest(
  headers: Headers,
  secret: string | undefined = process.env.CARTESIA_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept requests when unconfigured
  const received = headers.get('x-webhook-secret');
  if (!received) return false;
  return safeEqual(received, secret);
}
