// Generated with: planning-center-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify X-PCO-Webhooks-Authenticity: bare hex HMAC-SHA256 of the raw body.
 * The authenticity_secret is the HMAC key as a UTF-8 string (do NOT hex-decode it).
 */
export function verifyPlanningCenter(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !signature) return false;
  // Validate before Buffer.from(x, 'hex'): invalid hex silently truncates
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
