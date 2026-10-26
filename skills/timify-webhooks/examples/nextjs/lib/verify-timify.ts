// Generated with: timify-webhooks skill
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
 * TIMIFY does not sign payloads. When "Include header name" is enabled on the webhook
 * subscription, every request carries the header name and secret value you chose.
 * Compare the WHOLE header value (no Bearer parsing). Headers.get() is case-insensitive.
 */
export function verifyTimifyRequest(
  headers: Headers,
  secret: string | undefined = process.env.TIMIFY_WEBHOOK_SECRET,
  headerName: string = process.env.TIMIFY_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
