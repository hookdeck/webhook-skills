// Generated with: complycube-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify a ComplyCube webhook signature.
 *
 * ComplyCube sends `ComplyCube-Signature: <hex>` (no prefix): the lowercase hex HMAC-SHA256 of the
 * raw request body bytes, keyed with the webhook's secret. Nothing else is signed.
 */
export function verifyComplyCubeSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string
): boolean {
  // Check the hex shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!signatureHeader || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}
