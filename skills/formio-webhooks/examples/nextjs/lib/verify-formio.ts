// Generated with: formio-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/** SHA-256 both sides so the buffers are always equal length for timingSafeEqual. */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)". The scheme is case-insensitive
 * and the credentials are split on the FIRST colon (passwords may contain colons).
 */
export function parseBasicAuth(
  header: string | null
): { username: Buffer; password: Buffer } | null {
  const match = /^basic +([A-Za-z0-9+/]+={0,2}) *$/i.exec(header || '');
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * Form.io does not sign webhooks. The Webhook action's Authorize User / Authorize Password
 * fields are sent as HTTP Basic auth. A static credential authenticates the sender only: it
 * says nothing about the body and gives no replay protection.
 */
export function verifyFormioRequest(
  headers: Headers,
  username: string | undefined = process.env.FORMIO_WEBHOOK_USERNAME,
  password: string | undefined = process.env.FORMIO_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(creds.username, Buffer.from(username, 'utf8'));
  const passOk = safeEqual(creds.password, Buffer.from(password, 'utf8'));
  return userOk && passOk;
}
