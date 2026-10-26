// Generated with: payjp-webhooks skill
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
 * PAY.JP does not sign payloads. Every webhook carries X-Payjp-Webhook-Token, the
 * account's webhook token (whook_...). It authenticates the sender, not the body,
 * and gives no replay protection: use HTTPS and rotate the token if it leaks.
 */
export function verifyPayjpRequest(
  headers: Headers,
  secret: string | undefined = process.env.PAYJP_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get('x-payjp-webhook-token');
  return Boolean(received) && safeEqual(received as string, secret);
}

// Demo dedupe store. Use a shared store (Redis, database) with a TTL in production.
export const seenEvents = new Set<string>();
