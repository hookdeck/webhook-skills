// Generated with: honeybadger-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the token's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Honeybadger does not sign payloads. Every webhook carries a Honeybadger-Token
 * header: a secret token derived from the project API key, sent raw with no prefix.
 * (The optional Authorization: Bearer token is NOT what we check.)
 */
export function verifyHoneybadgerRequest(
  headers: Headers,
  token: string | undefined = process.env.HONEYBADGER_TOKEN
): boolean {
  if (!token) return false; // never accept when unconfigured
  const received = headers.get('honeybadger-token');
  return Boolean(received) && safeEqual(received as string, token);
}
