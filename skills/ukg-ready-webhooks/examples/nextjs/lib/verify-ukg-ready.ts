// Generated with: ukg-ready-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export interface UkgReadyAuthConfig {
  UKG_READY_AUTHORIZATION?: string;
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
 * UKG Ready (Ready only, not UKG Pro) does not sign payloads. With Bearer Token
 * authentication it is expected to send `Authorization: Bearer <token>`. Compare the WHOLE header
 * value, including the "Bearer " prefix: do not strip, parse or base64-decode it.
 */
export function verifyUkgReadyRequest(
  headers: Headers,
  config: UkgReadyAuthConfig = process.env
): boolean {
  const expected = config.UKG_READY_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
