// Generated with: workspace-one-webhooks skill
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
 * Workspace ONE UEM does not sign event notifications. It sends the User Name and
 * Password from the Event Notifications rule as HTTP Basic auth:
 *   Authorization: Basic base64(username:password)
 * The credentials must be on the first request; a 401 + WWW-Authenticate challenge
 * flow won't work (Hookdeck verifies the request as received).
 */
export function verifyWorkspaceOneRequest(
  headers: Headers,
  username: string | undefined = process.env.WORKSPACE_ONE_WEBHOOK_USERNAME,
  password: string | undefined = process.env.WORKSPACE_ONE_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured

  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec((headers.get('authorization') || '').trim());
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':'); // split on the FIRST colon; passwords may contain ':'
  if (colon === -1) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, colon), username);
  const passOk = safeEqual(decoded.slice(colon + 1), password);
  return userOk && passOk;
}
