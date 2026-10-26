import crypto from 'crypto';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Verify an Anarlog webhook signature.
 * `signatureHeader` is x-anarlog-signature (sha256=<hex>), the HMAC-SHA256 of the raw body.
 * `secret` is the full whsec_... string, used as a plain UTF-8 HMAC key (not Standard Webhooks).
 */
export function verifyAnarlogWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  // Exactly 64 hex chars before decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  const received = signatureHeader.slice(SIGNATURE_PREFIX.length);
  if (!/^[0-9a-f]{64}$/i.test(received)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
