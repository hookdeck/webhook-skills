// Generated with: aimfox-webhooks skill
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
 * Aimfox does not sign payloads. The only authentication is the "Authentication Header"
 * you add to the webhook: a user-chosen header name (AIMFOX_WEBHOOK_HEADER, default
 * Authorization) whose whole value (AIMFOX_WEBHOOK_SECRET, including any "Bearer " or
 * "Basic " prefix) is compared as-is. This authenticates the sender, not the body, and
 * gives no replay protection.
 */
export function verifyAimfoxRequest(
  headers: Headers,
  secret: string | undefined = process.env.AIMFOX_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const name = process.env.AIMFOX_WEBHOOK_HEADER || 'Authorization';
  const received = headers.get(name); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
