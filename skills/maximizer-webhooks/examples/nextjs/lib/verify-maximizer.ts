// Generated with: maximizer-webhooks skill
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
 * Maximizer does not sign payloads. You add a header to the target's Endpoint.Headers
 * and Maximizer sends it on every request. The header name is yours to choose, so it
 * comes from MAXIMIZER_WEBHOOK_HEADER (default "Authorization"). The WHOLE header value
 * is compared with MAXIMIZER_WEBHOOK_SECRET; a "Bearer " prefix is not parsed or stripped.
 * This authenticates the sender only: it does not cover the body and has no replay protection.
 */
export function verifyMaximizerRequest(
  headers: Headers,
  secret: string | undefined = process.env.MAXIMIZER_WEBHOOK_SECRET,
  headerName: string = process.env.MAXIMIZER_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return received !== null && safeEqual(received, secret);
}
