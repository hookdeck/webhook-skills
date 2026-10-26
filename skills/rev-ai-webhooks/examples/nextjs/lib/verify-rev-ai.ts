// Generated with: rev-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export interface RevAiAuthConfig {
  REV_AI_AUTHORIZATION?: string;
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
 * Rev AI does not sign payloads. The credential is the Authorization header you set in
 * notification_config.auth_headers when submitting the job, e.g. "Bearer <token>".
 * Compare the WHOLE header value (scheme prefix included) with REV_AI_AUTHORIZATION.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyRevAiRequest(
  headers: Headers,
  config: RevAiAuthConfig = process.env
): boolean {
  const expected = config.REV_AI_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
