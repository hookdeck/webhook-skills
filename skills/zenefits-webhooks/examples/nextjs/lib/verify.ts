import crypto from 'crypto';

/**
 * Verify the `signature` header: hex(HMAC-SHA256(rawBody, webhookSharedSecret)).
 * The secret is the app's webhook shared secret, not the OAuth client secret.
 */
export function verifyZenefitsSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  // Buffer.from(x, 'hex') silently truncates invalid hex, so check the format first
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}
