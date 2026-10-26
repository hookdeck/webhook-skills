// Generated with: webinarjam-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type WebinarJamAuthConfig = Record<string, string | undefined>;

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
 * WebinarJam does not sign requests. The only authentication is the header you add on the
 * Custom Webhook integration: the Bearer token option sends `Authorization: Bearer <token>`,
 * the Custom header option sends the name and value you chose. The header name comes from
 * WEBINARJAM_WEBHOOK_HEADER (default Authorization) and the WHOLE value (including any
 * "Bearer " prefix) is compared with WEBINARJAM_WEBHOOK_SECRET. Don't strip or parse the prefix.
 */
export function verifyWebinarJamRequest(
  headers: Headers,
  config: WebinarJamAuthConfig = process.env
): boolean {
  const expected = config.WEBINARJAM_WEBHOOK_SECRET;
  if (!expected) return false; // never accept when unconfigured
  const name = config.WEBINARJAM_WEBHOOK_HEADER || 'Authorization';
  const received = headers.get(name); // Headers lookup is case-insensitive
  if (!received) return false;
  return safeEqual(received, expected);
}
