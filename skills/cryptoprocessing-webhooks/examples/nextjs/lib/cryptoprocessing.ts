import crypto from 'crypto';

const SIGNATURE_PATTERN = /^[0-9a-fA-F]{128}$/;

/**
 * Verify a CryptoProcessing callback signature.
 *
 * X-Processing-Signature = lowercase hex HMAC-SHA512 of the raw body, keyed with
 * the secret of the active Master API key (used as UTF-8 bytes). Nothing else is signed.
 */
export function verifyCryptoProcessingSignature(
  rawBody: Buffer,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }
  // Validate length and alphabet before decoding (Buffer.from(hex) drops bad characters)
  if (!SIGNATURE_PATTERN.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');

  // Both are 64 bytes here, so timingSafeEqual cannot throw
  return crypto.timingSafeEqual(received, expected);
}
