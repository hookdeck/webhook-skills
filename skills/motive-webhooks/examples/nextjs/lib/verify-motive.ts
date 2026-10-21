import crypto from 'crypto';

/**
 * Verify a Motive webhook signature.
 *
 * Motive sends X-KT-Webhook-Signature = hex(HMAC-SHA1(sharedSecret, rawBody)).
 * The secret is used as a plain string. No timestamp, no prefix.
 */
export function verifyMotiveSignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}
