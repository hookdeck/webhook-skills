// Generated with: gumlet-webhooks skill
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
 * Gumlet does not sign payloads. If the webhook has a Secret Token, Gumlet sends it
 * back as plain text in the x-gumlet-token header of every request. Compare the whole
 * value. This authenticates the sender only: no body integrity, no replay protection.
 */
export function verifyGumletRequest(
  headers: Headers,
  secret: string | undefined = process.env.GUMLET_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get('x-gumlet-token');
  return Boolean(received) && safeEqual(received as string, secret);
}
