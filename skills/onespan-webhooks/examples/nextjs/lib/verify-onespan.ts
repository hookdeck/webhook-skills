// Generated with: onespan-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type OneSpanAuthConfig = Record<string, string | undefined>;

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
 * OneSpan Sign does not sign payloads. The callback key you registered is sent as
 * `Authorization: Basic {callbackKey}`: the raw key, NOT base64(user:pass), so don't
 * decode it as HTTP Basic. Compare the complete header value, including the "Basic "
 * prefix, with ONESPAN_AUTHORIZATION.
 */
export function verifyOneSpanRequest(
  headers: Headers,
  config: OneSpanAuthConfig = process.env
): boolean {
  const expected = config.ONESPAN_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
