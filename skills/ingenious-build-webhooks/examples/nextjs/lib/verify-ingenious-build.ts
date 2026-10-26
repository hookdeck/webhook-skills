// Generated with: ingenious-build-webhooks skill
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
 * INGENIOUS.BUILD does not sign payloads. You add an auth header (name of your choice, e.g.
 * Authorization: Bearer <token>) to each webhook URL; we compare the WHOLE header value, with no
 * 'Bearer ' parsing. A static credential authenticates the sender, not the body, and gives no
 * replay protection.
 */
export function verifyIngeniousBuildRequest(
  headers: Headers,
  name: string = process.env.INGENIOUS_BUILD_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.INGENIOUS_BUILD_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
