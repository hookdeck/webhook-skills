// Generated with: felloh-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Felloh sends the bare hex HMAC-SHA256 of the raw request body in X-Signature.
 * The signing key is used as UTF-8 bytes. The format is checked before decoding, because
 * Buffer.from(x, 'hex') silently drops invalid characters.
 */
export function verifyFellohSignature(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  secret: string | undefined = process.env.FELLOH_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}
