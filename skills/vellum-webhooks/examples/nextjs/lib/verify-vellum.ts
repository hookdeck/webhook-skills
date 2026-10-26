// Generated with: vellum-webhooks skill
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
 * Vellum Monitoring webhooks are authenticated with a static header you configure:
 * API Key Header (any header name) or Bearer Token (Authorization: Bearer <token>).
 * The whole header value is compared; a "Bearer " prefix is not stripped or parsed.
 * Vellum's optional HMAC signature (X-Vellum-Timestamp / X-Vellum-Signature) is NOT verified here.
 */
export function verifyVellumRequest(
  headers: Headers,
  secret: string | undefined = process.env.VELLUM_WEBHOOK_SECRET,
  headerName: string = process.env.VELLUM_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
