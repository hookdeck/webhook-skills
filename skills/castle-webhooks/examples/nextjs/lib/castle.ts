import crypto from 'crypto';

/**
 * Verify a Castle webhook: X-Castle-Signature is the base64 HMAC-SHA256
 * of the raw request body, keyed with the Castle API secret.
 */
export function verifyCastleSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}
