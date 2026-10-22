import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify a Kombo webhook signature.
 *
 * Kombo signs the RAW request body with HMAC-SHA256, keyed with the Kombo
 * Webhook Secret's UTF-8 bytes (not decoded), and sends the digest in the
 * X-Kombo-Signature header as base64url WITHOUT padding.
 */
export function verifyKomboWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('base64url');

  // Compare base64url text (padding stripped); decoding would skip invalid characters
  const provided = Buffer.from(signatureHeader.replace(/=+$/, ''));

  // timingSafeEqual throws on length mismatch, so check length first
  return provided.length === expected.length && timingSafeEqual(provided, Buffer.from(expected));
}
