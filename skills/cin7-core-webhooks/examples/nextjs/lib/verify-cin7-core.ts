// Generated with: cin7-core-webhooks skill
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
 * Cin7 Core does not sign payloads. It sends the header configured on the webhook
 * (bearerauth -> Authorization, or a custom ExternalHeaders key). Compare the WHOLE
 * value exactly; do not strip or parse a 'Bearer ' prefix.
 */
export function verifyCin7CoreRequest(
  headers: Headers,
  name: string = process.env.CIN7_CORE_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.CIN7_CORE_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
