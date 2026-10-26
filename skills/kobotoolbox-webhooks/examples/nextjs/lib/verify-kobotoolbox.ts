// Generated with: kobotoolbox-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison of two byte strings. Hashing both sides first gives
 * equal-length buffers, so timingSafeEqual never throws and length isn't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)". The scheme is
 * case-insensitive and the credentials split on the FIRST colon (passwords may
 * contain colons). Returns null if the header is missing or malformed.
 */
export function parseBasicAuth(header: string | null): { username: Buffer; password: Buffer } | null {
  if (!header) return null;
  const match = /^basic +([A-Za-z0-9+/]+=*)\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * KoboToolbox REST Services do not sign requests. They send HTTP Basic auth on
 * every request; a static credential, so it authenticates the sender, not the body.
 * Both comparisons run before deciding (no short-circuit).
 */
export function verifyKoboRequest(
  headers: Headers,
  username: string | undefined = process.env.KOBOTOOLBOX_WEBHOOK_USERNAME,
  password: string | undefined = process.env.KOBOTOOLBOX_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  const userOk = safeEqual(creds.username, Buffer.from(username, 'utf8'));
  const passOk = safeEqual(creds.password, Buffer.from(password, 'utf8'));
  return userOk && passOk;
}
