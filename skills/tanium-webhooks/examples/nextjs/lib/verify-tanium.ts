// Generated with: tanium-webhooks skill
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
 * Tanium Connect does not sign requests. Header Authentication adds one header you
 * name (Auth Header Name) with the value you chose (Secret). Headers.get() is
 * case-insensitive; compare the WHOLE value: no 'Bearer ' parsing or stripping.
 * This is a static shared credential: it authenticates the sender, not the body,
 * and gives no replay protection.
 */
export function verifyTaniumRequest(
  headers: Headers,
  secret: string | undefined = process.env.TANIUM_WEBHOOK_SECRET,
  headerName: string = process.env.TANIUM_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
