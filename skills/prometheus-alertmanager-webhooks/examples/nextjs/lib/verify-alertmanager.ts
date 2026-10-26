// Generated with: prometheus-alertmanager-webhooks skill
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

const BEARER = /^bearer /i; // auth schemes are case-insensitive (RFC 9110)

/**
 * Alertmanager does not sign payloads. http_config.authorization (default type
 * Bearer) sends `Authorization: Bearer <credentials>` on every request.
 * The secret is stored bare; if the configured value starts with "Bearer ",
 * that prefix is stripped (as Hookdeck does). The secret is otherwise untouched.
 */
export function verifyAlertmanagerRequest(
  headers: Headers,
  secret: string | undefined = process.env.ALERTMANAGER_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const expected = secret.replace(BEARER, '');
  if (!expected) return false; // a configured value of just "Bearer " must not match
  const header = headers.get('authorization');
  if (!header || !BEARER.test(header)) return false;
  return safeEqual(header.replace(BEARER, ''), expected);
}
