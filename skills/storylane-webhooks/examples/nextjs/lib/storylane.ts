// Generated with: storylane-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Standard padded base64 of a 32-byte HMAC-SHA256 digest: 43 chars + "="
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify a Storylane webhook signature.
 *
 * Storylane sends `x-storylane-signature: <base64>`: the standard base64 HMAC-SHA256 of the
 * raw request body, keyed with the Webhook Verification Secret. Nothing else is signed.
 */
export function verifyStorylaneSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string
): boolean {
  // Validate the shape first; this also rejects empty and missing headers
  if (!signatureHeader || !BASE64_SHA256.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  // Both strings are 44 ASCII chars, so the Buffers have equal length; compare exactly
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}
