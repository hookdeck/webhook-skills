// Generated with: metabase-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and lengths aren't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Metabase does not sign payloads. With "Basic" authentication it sends
 * `Authorization: Basic base64(username:password)` on every request, up front.
 * A static credential authenticates the sender, not the body, and gives no
 * replay protection: use HTTPS and rotate the credential if it leaks.
 */
export function verifyMetabaseRequest(
  headers: Headers,
  username: string | undefined = process.env.METABASE_WEBHOOK_USERNAME,
  password: string | undefined = process.env.METABASE_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured

  const header = headers.get('authorization');
  if (!header) return false;

  // Scheme is case-insensitive; the credentials must be strict base64.
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.toString('base64') !== match[1]) return false; // trailing junk / bad padding

  // Split on the first colon only: the password may contain colons.
  const colon = decoded.indexOf(0x3a);
  if (colon === -1) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.subarray(0, colon), Buffer.from(username));
  const passOk = safeEqual(decoded.subarray(colon + 1), Buffer.from(password));
  return userOk && passOk;
}
