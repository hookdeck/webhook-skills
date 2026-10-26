// Generated with: proxyclick-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type ProxyclickAuthConfig = Record<string, string | undefined>;

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
 * Parse `Authorization: Basic base64(username:password)`. The scheme is
 * case-insensitive and the credentials split on the FIRST colon. Returns null
 * for anything malformed.
 */
export function parseBasicAuth(header: string | null): { username: string; password: string } | null {
  if (!header) return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2}) *$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return null;
  return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/**
 * Proxyclick does not sign payloads. The only security option is HTTP Basic auth,
 * which must arrive on the FIRST request (no 401 + WWW-Authenticate challenge).
 * Both comparisons run before the result is combined (no short-circuit).
 */
export function verifyProxyclickRequest(
  headers: Headers,
  config: ProxyclickAuthConfig = process.env
): boolean {
  const expectedUser = config.PROXYCLICK_WEBHOOK_USERNAME;
  const expectedPass = config.PROXYCLICK_WEBHOOK_PASSWORD;
  if (!expectedUser || !expectedPass) return false; // never accept when unconfigured

  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;

  const userOk = safeEqual(creds.username, expectedUser);
  const passOk = safeEqual(creds.password, expectedPass);
  return userOk && passOk;
}
