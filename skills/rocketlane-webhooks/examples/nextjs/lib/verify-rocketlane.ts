// Generated with: rocketlane-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type RocketlaneAuthConfig = Record<string, string | undefined>;

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Strict base64 alphabet only, so valid credentials followed by junk are rejected.
const BASIC_HEADER = /^basic[ \t]+([A-Za-z0-9+/]+={0,2})$/i;

/**
 * Parse `Authorization: Basic base64(username:password)`. The scheme is
 * case-insensitive, the payload must be strict base64, and the split is on the
 * FIRST colon (the password may contain colons). Returns null if malformed.
 */
export function parseBasicAuth(
  header: string | null | undefined
): { username: string; password: string } | null {
  if (typeof header !== 'string') return null;
  const match = BASIC_HEADER.exec(header.trim());
  if (!match || match[1].length % 4 !== 0) return null;
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.toString('base64') !== match[1]) return null; // non-canonical padding/bits
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  if (colon === -1) return null;
  return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/**
 * Rocketlane does not sign payloads. The only authentication is HTTP Basic auth, which
 * must arrive on the first request (Hookdeck never answers with a 401 challenge). Both
 * the username and the password are compared before deciding, so there is no short-circuit.
 */
export function verifyRocketlaneRequest(
  headers: Headers,
  config: RocketlaneAuthConfig = process.env
): boolean {
  const expectedUser = config.ROCKETLANE_WEBHOOK_USERNAME;
  const expectedPass = config.ROCKETLANE_WEBHOOK_PASSWORD;
  if (!expectedUser || !expectedPass) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  const userOk = safeEqual(creds.username, expectedUser);
  const passOk = safeEqual(creds.password, expectedPass);
  return userOk && passOk;
}
