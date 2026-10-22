// Generated with: zuora-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison of two Buffers. Hashing both sides first gives
 * equal-length buffers, so timingSafeEqual never throws and length isn't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)".
 * Scheme is case-insensitive; the credentials split on the FIRST colon, so the
 * password may contain colons. Returns { username, password } as Buffers, or null.
 */
export function parseBasicAuth(
  header: string | null | undefined
): { username: Buffer; password: Buffer } | null {
  if (typeof header !== 'string') return null;
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'basic') return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(parts[1])) return null;

  const decoded = Buffer.from(parts[1], 'base64');
  const colon = decoded.indexOf(0x3a); // ':'
  if (colon === -1) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * Zuora callouts are not signed. The template's Username/Password authentication
 * (with Enable Preemptive Authentication) sends HTTP Basic credentials on every request.
 * Both values are compared before deciding, so a wrong username and a wrong password
 * take the same time.
 */
export function verifyZuoraRequest(
  headers: Headers,
  username: string | undefined = process.env.ZUORA_WEBHOOK_USERNAME,
  password: string | undefined = process.env.ZUORA_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;

  const userOk = safeEqual(creds.username, Buffer.from(username, 'utf8'));
  const passOk = safeEqual(creds.password, Buffer.from(password, 'utf8'));
  return userOk && passOk;
}
