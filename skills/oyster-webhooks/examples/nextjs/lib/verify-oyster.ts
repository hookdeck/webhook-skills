// Generated with: oyster-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type OysterAuthConfig = Record<string, string | undefined>;

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
 * Oyster does not sign payloads. The only authentication is the sharedSecret you
 * registered, sent as `Authorization: Bearer <sharedSecret>`. Compare the WHOLE header
 * value, "Bearer " prefix included; don't strip or parse it. A static credential
 * authenticates the sender, not the body, and gives no replay protection, so use
 * HTTPS, dedupe on the event id and rotate the secret if it leaks.
 */
export function verifyOysterRequest(
  headers: Headers,
  config: OysterAuthConfig = process.env
): boolean {
  const expected = config.OYSTER_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
