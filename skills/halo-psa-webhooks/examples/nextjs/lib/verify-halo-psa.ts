// Generated with: halo-psa-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type HaloPsaAuthConfig = Record<string, string | undefined>;

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Strict base64: only the standard alphabet, padding only at the end.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Parse `Authorization: Basic base64(username:password)`. The scheme is case-insensitive.
 * Anything that isn't strictly valid (junk after the credentials, characters outside the
 * base64 alphabet, bad padding, invalid UTF-8, no colon) returns null. Splits on the FIRST
 * colon, so the password may contain colons.
 */
export function parseBasicAuth(
  header: string | null | undefined
): { username: string; password: string } | null {
  if (typeof header !== 'string') return null;
  const match = header.match(/^basic +(\S+)$/i);
  if (!match) return null;
  const encoded = match[1];
  if (encoded.length % 4 !== 0 || !BASE64_RE.test(encoded)) return null;

  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(encoded, 'base64'));
  } catch {
    return null;
  }
  const sep = decoded.indexOf(':');
  if (sep === -1) return null;
  return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
}

/**
 * HaloPSA webhooks are not signed. With "Basic Authentication" chosen on the webhook, every
 * request carries `Authorization: Basic base64(username:password)`. The credentials must
 * arrive on the first request: Hookdeck never answers with a 401 + WWW-Authenticate challenge.
 */
export function verifyHaloPsaRequest(
  headers: Headers,
  config: HaloPsaAuthConfig = process.env
): boolean {
  const username = config.HALO_PSA_WEBHOOK_USERNAME;
  const password = config.HALO_PSA_WEBHOOK_PASSWORD;
  if (!username || !password) return false; // never accept when unconfigured

  const credentials = parseBasicAuth(headers.get('authorization'));
  if (!credentials) return false;

  // Evaluate both comparisons before deciding (no short-circuit on the username).
  const usernameOk = safeEqual(credentials.username, username);
  const passwordOk = safeEqual(credentials.password, password);
  return usernameOk && passwordOk;
}
