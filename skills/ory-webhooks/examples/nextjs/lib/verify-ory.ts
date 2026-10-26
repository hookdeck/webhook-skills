// Generated with: ory-webhooks skill
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
 * Ory does not sign webhooks. With auth.type api_key (in: header) it sends
 * `<name>: <value>`, both chosen by you. Compare the WHOLE header value, including any
 * "Bearer " prefix you typed. A static credential authenticates the sender, not the
 * body, and gives no replay protection.
 */
export function verifyOryRequest(
  headers: Headers,
  secret: string | undefined = process.env.ORY_WEBHOOK_SECRET,
  headerName: string = process.env.ORY_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
