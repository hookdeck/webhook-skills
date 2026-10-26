// Generated with: firstpromoter-webhooks skill
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
 * FirstPromoter does not sign payloads. Webhooks v2 subscriptions can send custom
 * headers; the header name is whatever you chose, and its value is compared whole
 * (do not strip a "Bearer " prefix). A static credential authenticates the sender,
 * not the body, and gives no replay protection: use HTTPS and dedupe on event_id.
 */
export function verifyFirstPromoterRequest(
  headers: Headers,
  secret: string | undefined = process.env.FIRSTPROMOTER_WEBHOOK_SECRET,
  name: string = process.env.FIRSTPROMOTER_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}

// In-memory dedupe for the example; use a durable store (Redis, database) in production.
export const seenEvents = new Set<string>();
