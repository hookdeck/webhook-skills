// Generated with: braze-webhooks skill
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

/** Parse "Authorization: Basic base64(username:password)". Scheme is case-insensitive. */
export function parseBasicAuth(
  header: string | null
): { username: string; password: string } | null {
  if (typeof header !== 'string') return null;
  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':'); // split on the FIRST colon: passwords may contain ':'
  if (i < 0) return null;
  return { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

/**
 * Braze does not sign webhooks. A Basic authentication credential saved in
 * Settings > Credential Management supplies the Authorization header. This checks it.
 * Both fields are compared before deciding (no short-circuit).
 */
export function verifyBrazeRequest(
  headers: Headers,
  username: string | undefined = process.env.BRAZE_WEBHOOK_USERNAME,
  password: string | undefined = process.env.BRAZE_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}
