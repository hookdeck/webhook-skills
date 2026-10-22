// Generated with: socure-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse 'Authorization: Basic base64(username:password)'. The scheme is
 * case-insensitive and the credentials split on the FIRST colon (passwords may
 * contain colons). Returns null for a missing or malformed header.
 */
export function parseBasicAuth(header: string | null | undefined): { username: string; password: string } | null {
  if (typeof header !== 'string') return null;
  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/**
 * Socure RiskOS does not sign payloads. It sends the Basic credentials configured on the
 * webhook with every request. Compare username and password each in constant time and
 * evaluate both before deciding (no short-circuit).
 */
export function verifySocureRequest(
  headers: Headers,
  username: string | undefined = process.env.SOCURE_WEBHOOK_USERNAME,
  password: string | undefined = process.env.SOCURE_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}
