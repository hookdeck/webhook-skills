// Generated with: railway-webhooks skill
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
 * Railway does not sign payloads. You add a custom header (name and value) to the
 * webhook in Project Settings > Webhooks; Railway sends it with every delivery.
 * The header name comes from RAILWAY_WEBHOOK_HEADER (default Authorization) and the
 * WHOLE expected value (including any "Bearer " prefix) from RAILWAY_WEBHOOK_SECRET.
 * Headers.get() is case-insensitive.
 */
export function verifyRailwayRequest(
  headers: Headers,
  secret: string | undefined = process.env.RAILWAY_WEBHOOK_SECRET,
  headerName: string = process.env.RAILWAY_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
