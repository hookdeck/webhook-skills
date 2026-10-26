// Generated with: ventrata-webhooks skill
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
 * Ventrata does not sign payloads. You add a secret header in the webhook's headers
 * map when you create it through the OCTO API. The header name is yours, so it comes
 * from VENTRATA_WEBHOOK_HEADER; the expected value is the exact, whole header value
 * (including any "Bearer " prefix). This authenticates the sender, not the body, and
 * gives no replay protection.
 */
export function verifyVentrataRequest(
  headers: Headers,
  secret: string | undefined = process.env.VENTRATA_WEBHOOK_SECRET,
  headerName: string = process.env.VENTRATA_WEBHOOK_HEADER || 'X-Webhook-Secret'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}

/** The capability lists booking_update; the API examples write booking.updated. */
export function normalizeEvent(event: unknown): unknown {
  const m = /^(order|booking|availability|product)[._](update|updated)$/.exec(String(event ?? ''));
  return m ? `${m[1]}_update` : event;
}
