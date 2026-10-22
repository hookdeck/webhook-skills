import crypto from 'crypto';

/**
 * Verify a Lago webhook signature (HMAC mode).
 *
 * X-Lago-Signature is the base64 HMAC-SHA256 of the raw request body, keyed
 * with the organization HMAC Signature Token.
 */
export function verifyLagoSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
