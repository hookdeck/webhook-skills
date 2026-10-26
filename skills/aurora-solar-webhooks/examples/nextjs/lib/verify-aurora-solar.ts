// Generated with: aurora-solar-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const DEFAULT_HEADER = 'X-Aurora-Webhook-Token';

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
 * Aurora Solar does not sign webhooks. You add a secret header to the subscription
 * (header_auth_key / header_auth_value) and Aurora sends it on every GET. The header
 * name is user-chosen; the whole value is compared as-is (no Bearer parsing).
 */
export function verifyAuroraSolarRequest(
  headers: Headers,
  secret: string | undefined = process.env.AURORA_SOLAR_WEBHOOK_SECRET,
  headerName: string = process.env.AURORA_SOLAR_WEBHOOK_HEADER || DEFAULT_HEADER
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
