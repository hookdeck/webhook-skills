// Generated with: stuart-webhooks skill
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
 * Stuart does not sign payloads. You choose a "Webhook authentication header" (name starts
 * with X-) and key; Stuart adds that header to every webhook. The value is compared whole:
 * no 'Bearer ' parsing. A static credential authenticates the sender, not the body, and gives
 * no replay protection: use HTTPS and rotate it if it leaks.
 */
export function verifyStuartRequest(
  headers: Headers,
  name: string = process.env.STUART_WEBHOOK_HEADER || 'X-Webhook-Secret',
  secret: string | undefined = process.env.STUART_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
