// Generated with: bitdefender-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export interface BitdefenderAuthConfig {
  BITDEFENDER_AUTHORIZATION?: string;
}

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
 * GravityZone does not sign payloads. The credential is the Authorization header, sent
 * verbatim from serviceSettings.authorization (e.g. "Bearer sfasdfw34243"). Compare the
 * WHOLE header value, including any "Bearer " / "Basic " prefix. Do not strip or decode it.
 */
export function verifyBitdefenderRequest(
  headers: Headers,
  config: BitdefenderAuthConfig = process.env
): boolean {
  const expected = config.BITDEFENDER_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
