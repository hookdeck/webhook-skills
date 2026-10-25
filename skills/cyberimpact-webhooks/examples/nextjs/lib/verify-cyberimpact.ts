// Generated with: cyberimpact-webhooks skill
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
 * Cyberimpact does not sign payloads. The scenario author adds a key-value pair to the
 * webhook headers; we compare that header's WHOLE value (no Bearer parsing) with the secret.
 * Headers.get() is case-insensitive.
 */
export function verifyCyberimpactRequest(
  headers: Headers,
  options: { name?: string; secret?: string } = {}
): boolean {
  const name = options.name ?? (process.env.CYBERIMPACT_WEBHOOK_HEADER || 'Authorization');
  const secret = options.secret ?? process.env.CYBERIMPACT_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name);
  return Boolean(received) && safeEqual(received as string, secret);
}
