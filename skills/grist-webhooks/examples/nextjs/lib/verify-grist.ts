// Generated with: grist-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export interface GristAuthConfig {
  [key: string]: string | undefined;
  GRIST_AUTHORIZATION?: string;
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
 * Grist does not sign payloads. The credential is the webhook's "Header Authorization"
 * field, a static string sent verbatim as the Authorization header. GRIST_AUTHORIZATION is
 * the whole value as typed in Grist (e.g. "Bearer <token>"): compare the complete header,
 * never strip or decode the scheme prefix.
 */
export function verifyGristRequest(
  headers: Headers,
  config: GristAuthConfig = process.env
): boolean {
  const expected = config.GRIST_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
