// Generated with: documenso-webhooks skill
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
 * Documenso does not sign the payload. It sends the webhook secret you configured as
 * plain text in the X-Documenso-Secret header (an empty string when no secret is set).
 * Reject an unconfigured secret and an empty header, then compare in constant time.
 */
export function verifyDocumensoSecret(
  receivedSecret: string | null | undefined,
  expectedSecret: string | undefined = process.env.DOCUMENSO_WEBHOOK_SECRET
): boolean {
  if (!expectedSecret) return false; // never accept requests when no secret is configured
  if (!receivedSecret) return false; // empty header = webhook created without a secret
  return safeEqual(receivedSecret, expectedSecret);
}
