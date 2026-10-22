import crypto from 'crypto';

/**
 * Verify a Fourthwall shop webhook signature.
 * The header is base64(HMAC-SHA256(secret, raw body)); there is no timestamp.
 */
export function verifyFourthwallSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;

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
