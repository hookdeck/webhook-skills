import crypto from 'crypto';

/**
 * Verify a Breezy HR webhook signature.
 * X-Hook-Signature is the bare hex HMAC-SHA256 of the raw body. The key is the
 * whole whsec_ secret as a UTF-8 string (not Standard Webhooks: no prefix
 * stripping, no base64 decoding).
 */
export function verifyBreezySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const received = Buffer.from(signature.trim().toLowerCase());
  const computed = Buffer.from(expected);

  // timingSafeEqual throws when lengths differ, so check first
  return received.length === computed.length && crypto.timingSafeEqual(received, computed);
}
