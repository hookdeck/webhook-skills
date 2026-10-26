import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify an api.video webhook signature.
 *
 * X-Api-Video-Signature is the bare hex HMAC-SHA256 of the raw request body,
 * keyed with the webhook's signatureSecret (used as UTF-8 bytes). Nothing else
 * is signed (no timestamp or id).
 */
export function verifyApiVideoSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }
  // Validate format before comparing: exactly 64 hex characters
  if (!HEX_SHA256.test(signatureHeader)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Hex is case-insensitive; compare equal-length ASCII buffers in constant time
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase(), 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}
