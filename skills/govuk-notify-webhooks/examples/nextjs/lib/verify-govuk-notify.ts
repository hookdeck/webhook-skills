// Generated with: govuk-notify-webhooks skill
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

const BEARER = 'bearer ';

/**
 * GOV.UK Notify does not sign callbacks. It sends `Authorization: Bearer <token>`, where the
 * token is the one you set for the callback. The secret is the BARE token; if the configured
 * value itself starts with "Bearer " (any case) that prefix is stripped, as Hookdeck does.
 * The scheme is matched case-insensitively (RFC 9110); the token is never trimmed.
 */
export function verifyNotifyRequest(
  headers: Headers,
  secret: string | undefined = process.env.GOVUK_NOTIFY_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const expected = secret.toLowerCase().startsWith(BEARER) ? secret.slice(BEARER.length) : secret;
  if (!expected) return false;

  const header = headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith(BEARER)) return false;
  return safeEqual(header.slice(BEARER.length), expected);
}
