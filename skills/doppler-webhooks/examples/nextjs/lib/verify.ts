import crypto from 'crypto';

/**
 * Verify a Doppler webhook signature.
 * `signatureHeader` is X-Doppler-Signature (sha256=<hex>), the HMAC-SHA256 of the raw body.
 */
export function verifyDopplerWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // timingSafeEqual throws on different lengths, so check first
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
