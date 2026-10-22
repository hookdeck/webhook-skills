import crypto from 'crypto';

/**
 * Verify a Zoho Sign webhook.
 *
 * X-ZS-WEBHOOK-SIGNATURE = base64(HMAC-SHA256(key = secret as UTF-8, message = raw body)).
 * (Zoho's docs write "HMAC SHA-256(payload+secret_key)", but the secret is the HMAC key and
 * is NOT appended to the payload.) No timestamp is signed.
 */
export function verifyZohoSignSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);

  // timingSafeEqual throws on length mismatch, so compare lengths first
  return expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
