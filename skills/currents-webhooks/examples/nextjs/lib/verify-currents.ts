// Generated with: currents-webhooks skill
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
 * Currents does not sign payloads. You add a secret custom header to the HTTP
 * Webhook integration; the header name is yours, so it comes from
 * CURRENTS_WEBHOOK_HEADER (default Authorization). The WHOLE header value is
 * compared with CURRENTS_WEBHOOK_SECRET: no "Bearer " parsing.
 *
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection. The unsigned x-timestamp header can be forged, so it is not checked.
 */
export function verifyCurrentsRequest(
  headers: Headers,
  secret: string | undefined = process.env.CURRENTS_WEBHOOK_SECRET,
  headerName: string = process.env.CURRENTS_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  let received: string | null;
  try {
    received = headers.get(headerName); // case-insensitive
  } catch {
    return false; // invalid header name configured
  }
  return Boolean(received) && safeEqual(received as string, secret);
}
