// Generated with: arcadia-webhooks skill
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
 * Arcadia does not sign payloads. Arcadia support adds a custom header (name and
 * value) to every webhook. The name is user-chosen, so it comes from
 * ARCADIA_WEBHOOK_HEADER; the whole header value is compared with
 * ARCADIA_WEBHOOK_SECRET (no "Bearer " parsing). This authenticates the sender,
 * not the body, and gives no replay protection.
 */
export function verifyArcadiaRequest(
  headers: Headers,
  env: Record<string, string | undefined> = process.env
): boolean {
  const secret = env.ARCADIA_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const name = env.ARCADIA_WEBHOOK_HEADER || 'X-Arcadia-Token';
  const received = headers.get(name); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
