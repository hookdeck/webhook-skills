// Generated with: jamf-pro-webhooks skill
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
 * Jamf Pro does not sign payloads. With Header Authentication you choose a header
 * name and value; Jamf Pro sends them on every request. Compare the WHOLE value
 * (do not strip a "Bearer " prefix). This authenticates the sender, not the body,
 * and gives no replay protection.
 */
export function verifyJamfProRequest(
  headers: Headers,
  name: string = process.env.JAMF_PRO_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.JAMF_PRO_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
