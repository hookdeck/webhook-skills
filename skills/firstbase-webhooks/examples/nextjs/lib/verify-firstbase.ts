// Generated with: firstbase-webhooks skill
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
 * Firstbase does not sign payloads. With Custom header authentication it sends the header
 * name and value you entered. Compare the WHOLE value (no Bearer parsing). Headers.get()
 * is case-insensitive.
 */
export function verifyFirstbaseRequest(
  headers: Headers,
  headerName: string = process.env.FIRSTBASE_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.FIRSTBASE_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
