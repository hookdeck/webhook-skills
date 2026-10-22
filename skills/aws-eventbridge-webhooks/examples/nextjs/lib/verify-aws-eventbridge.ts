// Generated with: aws-eventbridge-webhooks skill
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
 * Parse "Authorization: Basic base64(username:password)". The scheme is
 * case-insensitive and the username/password are split on the FIRST colon.
 * Returns null for a missing or malformed header.
 */
export function parseBasicAuth(
  header: string | null | undefined
): { username: string; password: string } | null {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/**
 * EventBridge does not sign API destination requests. With a Basic-auth Connection it
 * populates the Authorization header, which authenticates the sender (not the body).
 */
export function verifyAwsEventbridgeRequest(
  headers: Headers,
  username: string | undefined = process.env.AWS_EVENTBRIDGE_WEBHOOK_USERNAME,
  password: string | undefined = process.env.AWS_EVENTBRIDGE_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}
