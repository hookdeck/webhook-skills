// Generated with: workato-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Reads WORKATO_WEBHOOK_USERNAME and WORKATO_WEBHOOK_PASSWORD.
export type WorkatoAuthConfig = Record<string, string | undefined>;

/**
 * Constant-time string comparison. Lengths are checked first (equal-length
 * buffers are required by timingSafeEqual), then the bytes are compared.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Workato has no webhook signature. The recipe's HTTP action uses an HTTP
 * connection with Basic auth, which sends:
 *   Authorization: Basic base64(username:password)
 * This is a static shared credential: it authenticates the sender, not the
 * body, and gives no replay protection.
 */
export function verifyWorkatoRequest(
  headers: Headers,
  config: WorkatoAuthConfig = process.env
): boolean {
  const user = config.WORKATO_WEBHOOK_USERNAME;
  const password = config.WORKATO_WEBHOOK_PASSWORD;
  if (!user || !password) return false; // never accept when unconfigured

  const match = (headers.get('authorization') ?? '').match(/^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i);
  if (!match) return false;

  const decoded = Buffer.from(match[1].trim(), 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // the password may itself contain ':'
  if (sep === -1) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, sep), user);
  const passwordOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passwordOk;
}
