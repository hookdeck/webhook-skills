// Generated with: baserow-webhooks skill
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
 * Baserow does not sign payloads. You add a secret custom header to the webhook; the header name
 * is yours to choose (BASEROW_WEBHOOK_HEADER, default 'Authorization') and the expected value is
 * the exact, whole header value (BASEROW_WEBHOOK_SECRET), including any 'Bearer ' prefix you typed.
 * Do not strip or parse a prefix. Headers.get() is case-insensitive.
 */
export function verifyBaserowRequest(
  headers: Headers,
  name: string = process.env.BASEROW_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.BASEROW_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name);
  return Boolean(received) && safeEqual(received as string, secret);
}
