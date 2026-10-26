// Generated with: thinkific-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify X-Thinkific-Hmac-Sha256: the hex HMAC-SHA256 of the raw request body, keyed with the
 * secret's UTF-8 bytes. Nothing else is signed (no timestamp or id), so there is no replay window.
 * `rawBody` must be the exact bytes received.
 */
export function verifyThinkificSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.THINKIFIC_WEBHOOK_SECRET
): boolean {
  if (!secret || !signature || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // safe: format validated above
  return crypto.timingSafeEqual(received, expected);
}
