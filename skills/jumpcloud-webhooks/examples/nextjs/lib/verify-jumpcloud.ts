// Generated with: jumpcloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)". The scheme is
 * case-insensitive and the value splits on the FIRST colon (passwords may
 * contain colons). Returns null if the header is missing or malformed.
 */
export function parseBasicAuth(header: string | null): { username: string; password: string } | null {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/**
 * JumpCloud webhook channels are not signed. With Basic Authentication selected,
 * every request carries the channel's username and password. Compare both in
 * constant time and evaluate both before deciding (no short-circuit).
 */
export function verifyJumpCloudRequest(
  headers: Headers,
  username: string | undefined = process.env.JUMPCLOUD_WEBHOOK_USERNAME,
  password: string | undefined = process.env.JUMPCLOUD_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}
