import crypto from 'crypto';

/**
 * Verify a RocketReach webhook.
 *
 * X-RocketReach-Signature = base64(HMAC-SHA256(key = secret as UTF-8, message = raw body)).
 * No timestamp is signed.
 */
export function verifyRocketReachSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  // Compare the base64 strings as UTF-8 bytes: no lenient base64 decoding of the header
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);

  // timingSafeEqual throws on length mismatch, so compare lengths first
  return expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
