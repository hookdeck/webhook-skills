// Generated with: emarsys-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/** SHA-256 digests are equal length, so timingSafeEqual never throws. */
function safeEqual(a: Buffer | string, b: Buffer | string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)".
 * - scheme is case-insensitive
 * - only the strict base64 alphabet is accepted, with canonical padding, so valid
 *   credentials followed by junk are rejected
 * - split on the FIRST colon (the password may contain colons)
 */
export function parseBasicAuth(
  header: string | null | undefined
): { username: Buffer; password: Buffer } | null {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (!match || match[1].length % 4 !== 0) return null;
  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.toString('base64') !== match[1]) return null; // non-canonical encoding
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * SAP Emarsys does not sign Webhook node calls. The sender authenticates with HTTP Basic auth
 * (a static shared credential), so this proves who sent the request, not that the body is
 * untampered, and it gives no replay protection.
 */
export function verifyEmarsysRequest(
  headers: Headers,
  username: string | null | undefined = process.env.EMARSYS_WEBHOOK_USERNAME,
  password: string | null | undefined = process.env.EMARSYS_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const credentials = parseBasicAuth(headers.get('authorization'));
  if (!credentials) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(credentials.username, username);
  const passOk = safeEqual(credentials.password, password);
  return userOk && passOk;
}
