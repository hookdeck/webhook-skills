// Generated with: mono-webhooks skill
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
 * Mono does not sign payloads. Every webhook carries a mono-webhook-secret header
 * holding the app's webhook secret as plain text; compare the whole value.
 * A static shared credential authenticates the sender, not the body, and gives no
 * replay protection, so use HTTPS and rotate the secret if it leaks.
 */
export function verifyMonoRequest(
  headers: Headers,
  secret: string | undefined = process.env.MONO_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get('mono-webhook-secret');
  return Boolean(received) && safeEqual(received as string, secret);
}
