// Generated with: northflank-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type NorthflankAuthConfig = Record<string, string | undefined>;

const TOKEN_HEADER = 'x-northflank-notification-integration-token';

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
 * Northflank does not sign the payload. The secret you set on the notification
 * integration is sent as-is in the X-Northflank-Notification-Integration-Token
 * header; compare it with NORTHFLANK_WEBHOOK_SECRET.
 */
export function verifyNorthflankRequest(
  headers: Headers,
  config: NorthflankAuthConfig = process.env
): boolean {
  const secret = config.NORTHFLANK_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured

  const token = headers.get(TOKEN_HEADER);
  if (!token) return false;
  return safeEqual(token, secret);
}
