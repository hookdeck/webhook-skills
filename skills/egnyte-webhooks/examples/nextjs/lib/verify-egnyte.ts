// Generated with: egnyte-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type EgnyteAuthConfig = Record<string, string | undefined>;

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
 * Egnyte does not sign payloads. It sends the `authHeader` configured at webhook
 * registration as the `Authorization` header. Compare the complete header value,
 * including any "Bearer " prefix; don't strip or parse it.
 */
export function verifyEgnyteRequest(
  headers: Headers,
  config: EgnyteAuthConfig = process.env
): boolean {
  const expected = config.EGNYTE_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
