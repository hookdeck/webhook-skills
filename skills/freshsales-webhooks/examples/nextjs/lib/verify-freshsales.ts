// Generated with: freshsales-webhooks skill
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
 * Freshsales does not sign webhooks. Authenticate with a secret custom header you
 * add on the workflow's Trigger webhook action. The header name is yours to choose
 * (FRESHSALES_WEBHOOK_HEADER); the WHOLE header value must equal
 * FRESHSALES_WEBHOOK_SECRET. No "Bearer " parsing: a prefix is part of the value.
 */
export function verifyFreshsalesRequest(
  headers: Headers,
  secret: string | undefined = process.env.FRESHSALES_WEBHOOK_SECRET,
  headerName: string = process.env.FRESHSALES_WEBHOOK_HEADER || 'X-Webhook-Secret'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
