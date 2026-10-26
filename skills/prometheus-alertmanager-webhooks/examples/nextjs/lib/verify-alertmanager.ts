// Generated with: prometheus-alertmanager-webhooks skill
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

const BEARER = /^bearer /i; // auth schemes are case-insensitive (RFC 9110)
const BASIC = /^basic +([A-Za-z0-9+/]+={0,2})$/i;

export interface BasicCredentials {
  username: string | undefined;
  password: string | undefined;
}

/** Decode `Basic base64(username:password)`; null unless it is canonical base64 with a colon. */
function parseBasic(header: string): { username: string; password: string } | null {
  const m = BASIC.exec(header);
  if (!m || m[1].length % 4 !== 0) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.toString('base64') !== m[1]) return null; // reject junk after valid base64
  const decoded = buf.toString('utf8');
  const i = decoded.indexOf(':'); // split on the FIRST colon: a password may contain ':'
  if (i === -1) return null;
  return { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

/**
 * Alertmanager does not sign payloads. The receiver's http_config sets the Authorization
 * header on every request, in one of two forms (Hookdeck's source offers both):
 * - authorization (default type Bearer): `Authorization: Bearer <credentials>`. The secret is
 *   stored bare in ALERTMANAGER_WEBHOOK_SECRET; a leading "Bearer " in it is stripped.
 * - basic_auth: `Authorization: Basic base64(username:password)`, checked against
 *   ALERTMANAGER_WEBHOOK_USERNAME and ALERTMANAGER_WEBHOOK_PASSWORD.
 * A form that isn't configured is rejected, so with neither configured everything is rejected.
 */
export function verifyAlertmanagerRequest(
  headers: Headers,
  secret: string | undefined = process.env.ALERTMANAGER_WEBHOOK_SECRET,
  basic: BasicCredentials = {
    username: process.env.ALERTMANAGER_WEBHOOK_USERNAME,
    password: process.env.ALERTMANAGER_WEBHOOK_PASSWORD,
  }
): boolean {
  const header = headers.get('authorization');
  if (!header) return false;

  if (BEARER.test(header)) {
    if (!secret) return false; // Bearer not configured
    const expected = secret.replace(BEARER, '');
    if (!expected) return false; // a configured value of just "Bearer " must not match
    return safeEqual(header.replace(BEARER, ''), expected);
  }

  if (/^basic /i.test(header)) {
    if (!basic || !basic.username || !basic.password) return false; // basic_auth not configured
    const creds = parseBasic(header);
    if (!creds) return false;
    const userOk = safeEqual(creds.username, basic.username);
    const passOk = safeEqual(creds.password, basic.password); // evaluate both, no short-circuit
    return userOk && passOk;
  }

  return false;
}
