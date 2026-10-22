// Generated with: paperform-webhooks skill
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
 * Paperform does not sign payloads. Authenticate with a secret custom header added to the
 * webhook (Custom headers toggle). The header name is user-chosen, and the whole header value
 * is compared (no Bearer parsing). A static credential authenticates the sender, not the body,
 * and gives no replay protection: use HTTPS and rotate it if it leaks.
 */
export function verifyPaperformRequest(
  headers: Headers,
  headerName: string = process.env.PAPERFORM_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.PAPERFORM_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
