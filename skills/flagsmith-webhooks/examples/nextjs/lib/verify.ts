import crypto from 'crypto';

/**
 * Verify X-Flagsmith-Signature: hex HMAC-SHA256 of the raw body, keyed with the secret.
 * Flagsmith has no timestamp header, so there is no replay window to check.
 */
export function verifyFlagsmithSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!rawBody || !signatureHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so guard first
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}
