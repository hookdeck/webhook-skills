// Generated with: new-relic-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison. Hashing both sides first gives equal-length buffers,
 * so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * New Relic does not sign webhooks. A Webhook destination can send
 * "Authorization: Basic base64(username:password)", which authenticates the sender
 * only. It does not cover the body and gives no replay protection.
 */
export function verifyNewRelicRequest(
  headers: Headers,
  username: string | undefined = process.env.NEW_RELIC_WEBHOOK_USERNAME,
  password: string | undefined = process.env.NEW_RELIC_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured

  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers.get('authorization') || '');
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a); // split on the FIRST colon: passwords may contain ':'
  if (colon === -1) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.subarray(0, colon), Buffer.from(username));
  const passOk = safeEqual(decoded.subarray(colon + 1), Buffer.from(password));
  return userOk && passOk;
}
