// Generated with: lessonly-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export interface LessonlyAuthConfig {
  LESSONLY_AUTHORIZATION?: string;
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
 * Lessonly (Seismic Learning) does not sign payloads. The credential is the
 * Authorization header, sent verbatim from lesson_completed_callback_authorization.
 * Compare the WHOLE header value, including any "Bearer " or "Basic " prefix you
 * set; do not strip, parse or base64-decode it.
 *
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection: use HTTPS and rotate the credential if it leaks.
 */
export function verifyLessonlyRequest(
  headers: Headers,
  config: LessonlyAuthConfig = process.env
): boolean {
  const expected = config.LESSONLY_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
