// Generated with: torii-webhooks skill
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
 * Torii requests are unsigned. The workflow author adds a secret header to the
 * custom action; the header name is user-chosen. Compare the WHOLE value
 * (including any "Bearer " prefix) with TORII_WEBHOOK_SECRET.
 * Headers.get() is case-insensitive.
 */
export function verifyToriiRequest(
  headers: Headers,
  secret: string | undefined = process.env.TORII_WEBHOOK_SECRET,
  headerName: string = process.env.TORII_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
