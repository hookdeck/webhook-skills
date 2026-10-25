// Generated with: nexthink-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type NexthinkAuthConfig = Record<string, string | undefined>;

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Nexthink does not sign payloads. The credential is the `Authorization` header built from
 * the Bearer token connector credential ("<Header prefix> <Token>"). Compare the complete
 * header value, including the scheme prefix; don't strip, parse or decode it.
 *
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection: use HTTPS and rotate the credential if it leaks.
 */
export function verifyNexthinkRequest(
  headers: Headers,
  config: NexthinkAuthConfig = process.env
): boolean {
  const expected = config.NEXTHINK_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
