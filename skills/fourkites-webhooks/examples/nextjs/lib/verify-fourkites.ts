// Generated with: fourkites-webhooks skill
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
 * FourKites does not sign callbacks. With Basic auth every request carries
 * 'Authorization: Basic base64(username:password)'. This authenticates the sender,
 * not the body, and gives no replay protection: use HTTPS and rotate on leak.
 * The credentials must arrive on the first request (no 401 + WWW-Authenticate challenge).
 */
export function verifyFourKitesRequest(
  headers: Headers,
  user: string | undefined = process.env.FOURKITES_WEBHOOK_USERNAME,
  pass: string | undefined = process.env.FOURKITES_WEBHOOK_PASSWORD
): boolean {
  if (!user || !pass) return false; // never accept when unconfigured
  const m = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers.get('authorization') ?? ''); // scheme is case-insensitive
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':'); // split on the first colon
  if (i < 0) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, i), user);
  const passOk = safeEqual(decoded.slice(i + 1), pass);
  return userOk && passOk;
}
