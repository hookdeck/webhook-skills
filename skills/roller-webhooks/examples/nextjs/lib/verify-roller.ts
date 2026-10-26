// Generated with: roller-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * ROLLER does not sign payloads. It sends the webhook's authentication.apiKey as
 * plain text in the x-roller-apikey header. This authenticates the sender only:
 * there is no timestamp, so no replay protection.
 */
export function verifyRollerRequest(
  headers: Headers,
  apiKey: string | undefined = process.env.ROLLER_WEBHOOK_API_KEY
): boolean {
  if (!apiKey) return false; // never accept when unconfigured
  const received = headers.get('x-roller-apikey');
  return Boolean(received) && safeEqual(received as string, apiKey);
}
