// Generated with: demodesk-webhooks skill
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
 * Demodesk does not sign payloads. You add a custom header to the webhook endpoint
 * (the name is your choice) and compare its WHOLE value with the one you stored,
 * including any "Bearer " prefix you typed. Headers.get() is case-insensitive.
 */
export function verifyDemodeskRequest(
  headers: Headers,
  headerName: string = process.env.DEMODESK_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.DEMODESK_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
