// Generated with: kibana-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Strict base64 alphabet with correct padding: valid credentials followed by junk are rejected.
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Constant-time comparison. Hashing both sides first gives equal-length buffers,
 * so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Kibana does not sign webhooks. With Basic authentication selected on the connector it sends
 * `Authorization: Basic base64(username:password)` on every request. Hookdeck never sends a 401
 * challenge, so the header must be present on each request.
 */
export function verifyBasicAuth(
  authHeader: string | null | undefined,
  username: string | undefined = process.env.KIBANA_WEBHOOK_USERNAME,
  password: string | undefined = process.env.KIBANA_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const m = /^basic\s+(\S+)$/i.exec(authHeader ?? ''); // scheme is case-insensitive
  if (!m || !STRICT_BASE64.test(m[1])) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // split on the first colon; the password may contain ':'
  if (sep === -1) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, sep), username);
  const passOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passOk;
}

/** Parse JSON when it parses, otherwise keep the raw text (may be empty). */
export function parseBody(text: string): unknown {
  if (!text) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
