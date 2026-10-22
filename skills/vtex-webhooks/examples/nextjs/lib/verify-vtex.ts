// Generated with: vtex-webhooks skill
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
 * VTEX does not sign hooks. It sends the entries of the hook configuration's
 * "headers" object with every notification, so we check a secret header we added.
 * The header name is user-chosen; the whole value is compared (no Bearer parsing).
 */
export function verifyVtexRequest(
  headers: Headers,
  name: string = process.env.VTEX_WEBHOOK_HEADER || 'X-Webhook-Secret',
  secret: string | undefined = process.env.VTEX_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
