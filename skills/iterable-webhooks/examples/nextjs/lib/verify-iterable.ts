// Generated with: iterable-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type IterableAuthConfig = Record<string, string | undefined>;

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
 * Iterable does not sign payloads. The only authentication is the Authorization header
 * ("Bearer <token>" for OAuth 2.0, or exactly the string typed in Authentication Token
 * for Basic, e.g. "Basic abc123"). Compare the WHOLE value, prefix included; never strip
 * the prefix and never base64-decode a Basic value.
 */
export function verifyIterableRequest(
  headers: Headers,
  config: IterableAuthConfig = process.env
): boolean {
  const expected = config.ITERABLE_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
