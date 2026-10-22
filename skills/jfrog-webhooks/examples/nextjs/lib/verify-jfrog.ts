// Generated with: jfrog-webhooks skill
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
 * Token mode (the default, "use secret for signing" off): JFrog sends the
 * configured secret token as-is in the X-JFrog-Event-Auth header. There is no
 * payload signature, so compare the header to the secret.
 * Signing mode (an HMAC-SHA256 of the payload) is not covered: JFrog does not
 * document which header carries that signature.
 */
export function verifyJfrogRequest(
  headers: Headers,
  secret: string | undefined = process.env.JFROG_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const token = headers.get('x-jfrog-event-auth');
  return Boolean(token) && safeEqual(token as string, secret);
}
