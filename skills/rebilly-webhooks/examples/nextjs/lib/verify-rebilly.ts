// Generated with: rebilly-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Strict base64 alphabet: anything after the credentials (spaces, "!", extra "=") fails the match.
const BASIC_RE = /^basic +([A-Za-z0-9+/]+={0,2})$/i;
const COLON = 0x3a;

/**
 * Constant-time comparison. Hashing both sides first gives equal-length buffers,
 * so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Parse "Authorization: Basic base64(username:password)"; null when missing or malformed. */
function parseBasicAuth(header: string | null): { username: Buffer; password: Buffer } | null {
  if (!header) return null;
  const match = BASIC_RE.exec(header);
  if (!match || match[1].length % 4 !== 0) return null;
  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.toString('base64') !== match[1]) return null; // non-canonical encoding
  const colon = decoded.indexOf(COLON); // split on the FIRST colon: passwords may contain ":"
  if (colon === -1) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * Rebilly sends HTTP basic auth with every webhook when the webhook has credentials. There is
 * no signature check here: a static credential authenticates the sender, not the body, and
 * gives no replay protection.
 */
export function verifyRebillyRequest(
  headers: Headers,
  username: string | undefined = process.env.REBILLY_WEBHOOK_USERNAME,
  password: string | undefined = process.env.REBILLY_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(creds.username, Buffer.from(username, 'utf8'));
  const passOk = safeEqual(creds.password, Buffer.from(password, 'utf8'));
  return userOk && passOk;
}
