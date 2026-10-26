// Generated with: mews-pos-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Standard Base64 (padded) of a 32-byte digest: 43 characters plus "=".
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Mews POS signs the raw body with HMAC-SHA256 (key = secret as UTF-8 bytes) and sends the
 * bare padded Base64 digest in X-Signature. Nothing else is signed, so there is no timestamp
 * to check. The format is validated first so Buffer.from never decodes untrusted input, and
 * the Base64 string is compared exactly (a non-canonical encoding of the same bytes fails).
 */
export function verifyMewsPosSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.MEWS_POS_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string' || !SIGNATURE_FORMAT.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); // both 44 bytes
}
