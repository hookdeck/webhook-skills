// Generated with: factorial-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Factorial does not sign payloads. If the subscription was created with a
 * `challenge`, every delivery carries it, unchanged, in x-factorial-wh-challenge.
 * Compare the WHOLE header value with the challenge you stored.
 * (Without a challenge Factorial sends nothing to verify.)
 */
export function verifyFactorialRequest(
  headers: Headers,
  challenge: string | undefined = process.env.FACTORIAL_WH_CHALLENGE
): boolean {
  if (!challenge) return false; // never accept when unconfigured
  const received = headers.get('x-factorial-wh-challenge');
  return Boolean(received) && safeEqual(received as string, challenge);
}
