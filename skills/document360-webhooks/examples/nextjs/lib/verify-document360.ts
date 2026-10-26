// Generated with: document360-webhooks skill
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
 * Document360 does not sign payloads. You add a key-value header to the Webhook
 * channel; its name is your choice (DOCUMENT360_WEBHOOK_HEADER, default
 * "Authorization") and the expected value is the WHOLE header value
 * (DOCUMENT360_WEBHOOK_SECRET), including any "Bearer " prefix you typed.
 * Headers.get() is case-insensitive.
 */
export function verifyDocument360Request(
  headers: Headers,
  secret: string | undefined = process.env.DOCUMENT360_WEBHOOK_SECRET,
  headerName: string = process.env.DOCUMENT360_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
