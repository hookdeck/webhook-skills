// Generated with: tabby-webhooks skill
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
 * Tabby does not sign payloads. If you set header.title / header.value when registering the
 * webhook, Tabby adds that header to every notification. The name is yours (default X-Auth-Key);
 * the whole value is compared, with no Bearer-prefix parsing. A static credential authenticates
 * the sender, not the body, and gives no replay protection.
 */
export function verifyTabbyRequest(
  headers: Headers,
  name: string = process.env.TABBY_WEBHOOK_HEADER || 'X-Auth-Key',
  secret: string | undefined = process.env.TABBY_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
