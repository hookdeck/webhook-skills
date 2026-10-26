// Generated with: jobadder-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

type JobAdderAuthConfig = Record<string, string | undefined>;

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
 * JobAdder does not sign payloads. The only credential is the optional `authorization`
 * value set on the webhook, which JobAdder sends back as the Authorization header.
 * Compare the WHOLE header value (including any "Basic " / "Bearer " prefix) to
 * JOBADDER_AUTHORIZATION. Never strip, parse or base64-decode it.
 */
export function verifyJobAdderRequest(
  headers: Headers,
  config: JobAdderAuthConfig = process.env
): boolean {
  const expected = config.JOBADDER_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
