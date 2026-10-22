// Generated with: rudderstack-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type RudderstackAuthConfig = Record<string, string | undefined>;

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse `Authorization: Basic base64(username:password)`. The scheme is case-insensitive
 * and the credentials are split on the FIRST colon, so the password may contain colons.
 */
export function parseBasicAuth(
  header: string | null
): { username: string; password: string } | null {
  if (!header) return null;
  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/**
 * RudderStack does not sign payloads. The HTTP Webhook destination sends the Basic Auth
 * credentials you configured. Both values are compared (no short-circuit) before deciding.
 */
export function verifyRudderstackRequest(
  headers: Headers,
  config: RudderstackAuthConfig = process.env
): boolean {
  const expectedUser = config.RUDDERSTACK_WEBHOOK_USERNAME;
  const expectedPass = config.RUDDERSTACK_WEBHOOK_PASSWORD;
  if (!expectedUser || !expectedPass) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  const userOk = safeEqual(creds.username, expectedUser);
  const passOk = safeEqual(creds.password, expectedPass);
  return userOk && passOk;
}
