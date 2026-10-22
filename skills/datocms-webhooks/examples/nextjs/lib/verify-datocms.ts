// Generated with: datocms-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Hashing both sides gives equal-length buffers, so timingSafeEqual never throws
// and the length of the credential isn't leaked.
const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
const safeEqual = (a: string, b: string) => crypto.timingSafeEqual(digest(a), digest(b));

/**
 * DatoCMS does not sign payloads. If the webhook has HTTP basic auth set, every request
 * carries `Authorization: Basic base64(username:password)`. This authenticates the sender
 * only: it does not cover the body and gives no replay protection, so use HTTPS and rotate
 * the credentials if they leak.
 */
export function verifyDatoCmsRequest(
  headers: Headers,
  username: string | undefined = process.env.DATOCMS_WEBHOOK_USERNAME,
  password: string | undefined = process.env.DATOCMS_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured

  // Scheme is case-insensitive.
  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers.get('authorization') || '');
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':'); // split on the first colon: passwords may contain ':'
  if (colon < 0) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, colon), username);
  const passOk = safeEqual(decoded.slice(colon + 1), password);
  return userOk && passOk;
}
