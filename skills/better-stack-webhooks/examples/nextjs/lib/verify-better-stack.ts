// Generated with: better-stack-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const DEFAULT_HEADER = 'X-Better-Stack-Secret';

/**
 * Constant-time comparison of two Buffers. Hashing both sides first gives equal-length
 * digests, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const BASIC = /^basic +([A-Za-z0-9+/]+={0,2})$/i; // auth schemes are case-insensitive (RFC 9110)

/** Decode `Basic base64(username:password)`; null unless it is canonical base64 with a colon. */
function parseBasic(header: string | null): { username: string; password: string } | null {
  if (!header) return null;
  const m = BASIC.exec(header);
  if (!m || m[1].length % 4 !== 0) return null;
  const buf = Buffer.from(m[1], 'base64'); // lenient decoder, so check it round-trips
  if (buf.toString('base64') !== m[1]) return null;
  const decoded = buf.toString('utf8');
  const i = decoded.indexOf(':'); // split on the FIRST colon: a password may contain ':'
  if (i === -1) return null;
  return { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

export interface BetterStackConfig {
  headerName?: string;
  secret?: string;
  username?: string;
  password?: string;
}

function configFromEnv(): BetterStackConfig {
  return {
    headerName: process.env.BETTER_STACK_WEBHOOK_HEADER,
    secret: process.env.BETTER_STACK_WEBHOOK_SECRET,
    username: process.env.BETTER_STACK_WEBHOOK_USERNAME,
    password: process.env.BETTER_STACK_WEBHOOK_PASSWORD,
  };
}

/**
 * Better Stack does not sign webhooks. A webhook can carry two kinds of static credential,
 * and Hookdeck's Better Stack source offers both. A request passes if EITHER configured
 * method matches; a method that isn't configured is never used, so with neither configured
 * every request is rejected.
 * - Basic auth (auth_username / auth_password): BETTER_STACK_WEBHOOK_USERNAME and
 *   BETTER_STACK_WEBHOOK_PASSWORD.
 * - Custom header (headers_template): the header named by BETTER_STACK_WEBHOOK_HEADER
 *   (default X-Better-Stack-Secret) must equal BETTER_STACK_WEBHOOK_SECRET exactly.
 */
export function verifyBetterStackRequest(
  headers: Headers,
  config: BetterStackConfig = configFromEnv()
): boolean {
  // Custom header: whole value, verbatim (no prefix stripping, no trimming).
  let headerOk = false;
  if (config.secret) {
    const value = headers.get(config.headerName || DEFAULT_HEADER); // case-insensitive
    // Header values are decoded as latin1; compare against the secret's UTF-8 bytes.
    headerOk =
      value !== null &&
      safeEqual(Buffer.from(value, 'latin1'), Buffer.from(config.secret, 'utf8'));
  }

  // Basic auth: evaluate username and password both, no short-circuit.
  let basicOk = false;
  if (config.username && config.password) {
    const creds = parseBasic(headers.get('authorization'));
    if (creds) {
      const userOk = safeEqual(Buffer.from(creds.username), Buffer.from(config.username));
      const passOk = safeEqual(Buffer.from(creds.password), Buffer.from(config.password));
      basicOk = userOk && passOk;
    }
  }

  return headerOk || basicOk;
}
