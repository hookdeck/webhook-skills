// Generated with: 8x8-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type EightXEightAuthConfig = Record<string, string | undefined>;

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
 * 8x8 does not sign payloads. The only authentication is the optional HTTP Authorization
 * value you set on the webhook, sent back as the Authorization header (for example
 * "Bearer 9QQhlsEb8VY" or "Basic dXNlcjpwYXNzd29yZA=="). Compare the WHOLE header value,
 * scheme prefix included. Never strip the prefix or base64-decode a Basic value.
 */
export function verify8x8Request(
  headers: Headers,
  config: EightXEightAuthConfig = process.env
): boolean {
  const expected = config.EIGHT_X_EIGHT_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
