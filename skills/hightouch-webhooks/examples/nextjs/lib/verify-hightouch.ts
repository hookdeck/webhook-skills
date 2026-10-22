// Generated with: hightouch-webhooks skill
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
 * Hightouch does not sign requests. The HTTP Request destination sends the header you
 * configured (name is your choice), so authenticate by comparing that header's WHOLE value
 * with HIGHTOUCH_WEBHOOK_SECRET. Do not strip or parse a "Bearer " prefix: the secret is
 * whatever exact value you typed. Headers.get() is case-insensitive.
 *
 * A static shared credential authenticates the sender, not the body, and gives no replay
 * protection. Use HTTPS and rotate the credential if it leaks.
 */
export function verifyHightouchRequest(
  headers: Headers,
  secret: string | undefined = process.env.HIGHTOUCH_WEBHOOK_SECRET,
  headerName: string = process.env.HIGHTOUCH_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
