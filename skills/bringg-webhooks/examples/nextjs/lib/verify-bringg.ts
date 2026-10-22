// Generated with: bringg-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type BringgAuthConfig = Record<string, string | undefined>;

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
 * Bringg does not sign webhooks. Authenticate with the Static Header you added to the
 * webhook: the header name is yours (BRINGG_WEBHOOK_HEADER, default Authorization) and the
 * expected value (BRINGG_WEBHOOK_SECRET) is compared whole, including any "Bearer " prefix.
 * Headers.get() is case-insensitive.
 */
export function verifyBringgRequest(
  headers: Headers,
  config: BringgAuthConfig = process.env
): boolean {
  const secret = config.BRINGG_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured

  const received = headers.get(config.BRINGG_WEBHOOK_HEADER || 'Authorization');
  if (!received) return false;

  return safeEqual(received, secret);
}
