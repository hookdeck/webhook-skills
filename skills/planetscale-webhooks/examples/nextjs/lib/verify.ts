import crypto from 'crypto';

/**
 * Verify a PlanetScale webhook signature.
 * `signatureHeader` is X-PlanetScale-Signature: the bare hex HMAC-SHA256 of the raw body.
 * `secret` is the webhook secret, used as-is as a UTF-8 HMAC key.
 */
export function verifyPlanetScaleWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  // Exactly 64 hex chars before decoding: Buffer.from(x, 'hex') silently drops invalid characters
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}
