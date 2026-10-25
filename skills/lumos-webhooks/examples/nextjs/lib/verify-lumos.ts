// Generated with: lumos-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison of two strings. timingSafeEqual throws on unequal
 * lengths, so check the lengths first (this only leaks the secret's length).
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Lumos requests are authenticated with a custom header you add to the webhook
 * in Lumos. The header name is yours to choose (LUMOS_WEBHOOK_HEADER, default
 * Authorization) and the WHOLE value is compared with LUMOS_WEBHOOK_SECRET.
 * No "Bearer " prefix is stripped or parsed.
 *
 * NOTE: Lumos also signs requests (HMAC-SHA256 in X-Lumos-Webhook-Signature), but
 * the header format is documented in a login-gated article, so it is NOT verified here.
 */
export function verifyLumosRequest(
  headers: Headers,
  headerName: string = process.env.LUMOS_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.LUMOS_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
