import crypto from 'crypto';

/**
 * Verify a Taskade webhook signature.
 * `signatureHeader` is X-Taskade-Signature (sha256=<hex>), the HMAC-SHA256 of the raw body.
 */
export function verifyTaskadeWebhook(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  // Accept the value with or without the "sha256=" prefix
  const sig = signatureHeader.trim().replace(/^sha256=/i, '');

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-f]{64}$/i.test(sig)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}
