import crypto from 'crypto';

/**
 * Verify a Paysafe webhook signature.
 * Signature header = base64(HMAC_SHA256(hmacKey, raw JSON body)).
 * The HMAC key is used as a raw UTF-8 string (it is NOT base64-decoded).
 */
export function verifyPaysafeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!rawBody || !signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths = invalid
  }
}
