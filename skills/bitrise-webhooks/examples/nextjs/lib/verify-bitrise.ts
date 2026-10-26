// Generated with: bitrise-webhooks skill
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
 * Bitrise does not sign payloads. Authenticate with a secret custom header added to the
 * outgoing webhook's Headers section. The header name is user-chosen; the expected value is
 * the exact, whole header value (a 'Bearer ' prefix, if you typed one, is part of it).
 * This is a static shared credential: it authenticates the sender, not the body, and gives
 * no replay protection.
 */
export function verifyBitriseRequest(
  headers: Headers,
  secret: string | undefined = process.env.BITRISE_WEBHOOK_SECRET,
  headerName: string = process.env.BITRISE_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
