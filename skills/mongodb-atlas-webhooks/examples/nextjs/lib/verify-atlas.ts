import crypto from 'crypto';

/**
 * Verify a MongoDB Atlas alert webhook signature.
 *
 * When a Webhook Secret is set, Atlas sends X-MMS-Signature =
 * base64(HMAC-SHA1(secret, raw request body)). The secret is used as a raw
 * string (not decoded). Without a secret the header is absent.
 */
export function verifyAtlasSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
