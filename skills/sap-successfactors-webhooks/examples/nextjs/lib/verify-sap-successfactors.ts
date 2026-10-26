// Generated with: sap-successfactors-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse `Authorization: Basic base64(username:password)`.
 * The scheme is case-insensitive, the token must use only the strict base64
 * alphabet and decode canonically (so valid credentials followed by junk are
 * rejected), and the pair is split on the FIRST colon.
 */
export function parseBasicAuth(
  header: string | null | undefined
): { username: string; password: string } | null {
  if (typeof header !== 'string') return null;
  const match = /^basic +([^ ]+)$/i.exec(header);
  if (!match) return null;
  const token = match[1];
  if (token.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(token)) return null;
  const decoded = Buffer.from(token, 'base64');
  if (decoded.toString('base64') !== token) return null; // non-canonical padding bits
  const text = decoded.toString('utf8');
  const idx = text.indexOf(':');
  if (idx < 0) return null;
  return { username: text.slice(0, idx), password: text.slice(idx + 1) };
}

/**
 * SAP SuccessFactors does not sign requests. The Integration Center REST connection
 * sends HTTP Basic credentials; this checks them against your configured pair.
 * Both comparisons run before the result is decided (no short-circuit).
 */
export function verifySapSuccessFactorsRequest(
  headers: Headers,
  username: string | undefined = process.env.SAP_SUCCESSFACTORS_WEBHOOK_USERNAME,
  password: string | undefined = process.env.SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}
