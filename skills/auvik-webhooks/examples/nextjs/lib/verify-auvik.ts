// Generated with: auvik-webhooks skill
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
 * Auvik does not sign payloads. With Header authentication it sends the custom
 * header (Key and Value) you configured. Headers.get() is case-insensitive. The
 * WHOLE value is compared: no "Bearer " parsing. This authenticates the sender
 * only; it gives no body integrity or replay protection.
 */
export function verifyAuvikRequest(
  headers: Headers,
  headerName: string = process.env.AUVIK_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.AUVIK_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
