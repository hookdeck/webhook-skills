// Generated with: procore-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type ProcoreAuthConfig = Record<string, string | undefined>;

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
 * Procore does not sign payloads. The only credential is the optional "Authorization Header"
 * value configured on the hook, which Procore places verbatim in the Authorization header.
 * Compare the WHOLE header value, including any "Bearer " / "Basic " prefix. Never strip,
 * parse or base64-decode it.
 */
export function verifyProcoreRequest(
  headers: Headers,
  config: ProcoreAuthConfig = process.env
): boolean {
  const expected = config.PROCORE_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
