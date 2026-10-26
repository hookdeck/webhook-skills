// Generated with: prefect-webhooks skill
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
 * Prefect does not sign Custom Webhook notifications. You add a secret header in the
 * block's headers; the header name is yours, so it comes from PREFECT_WEBHOOK_HEADER
 * (default "Authorization"). Compare the WHOLE value with PREFECT_WEBHOOK_SECRET:
 * do not strip a "Bearer " prefix.
 */
export function verifyPrefectRequest(
  headers: Headers,
  secret: string | undefined = process.env.PREFECT_WEBHOOK_SECRET,
  headerName: string = process.env.PREFECT_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
