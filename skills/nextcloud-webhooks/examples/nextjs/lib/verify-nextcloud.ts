// Generated with: nextcloud-webhooks skill
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
 * Nextcloud does not sign payloads. With authMethod 'header', webhook_listeners merges
 * authData ({header: value}) into the request headers. The header name is user-chosen, so
 * both it and the expected value come from the environment. The WHOLE value is compared
 * (a "Bearer " prefix typed into authData is part of the secret, not parsed off).
 */
export function verifyNextcloudRequest(
  headers: Headers,
  secret: string | undefined = process.env.NEXTCLOUD_WEBHOOK_SECRET,
  headerName: string = process.env.NEXTCLOUD_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
