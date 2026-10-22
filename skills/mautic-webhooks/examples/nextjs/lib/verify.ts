import crypto from 'crypto';

/**
 * Verify the Mautic Webhook-Signature header.
 * Mautic sends base64(HMAC-SHA256(rawBody, secret)). Nothing else is signed.
 */
export function verifyMauticWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
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
