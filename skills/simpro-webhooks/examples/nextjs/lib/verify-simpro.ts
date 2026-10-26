import crypto from 'crypto';

/**
 * Verify a Simpro webhook signature.
 *
 * X-Response-Signature = lowercase hex HMAC-SHA1 of the raw body, keyed with the
 * subscription Secret. No prefix and no timestamp.
 */
export function verifySimproSignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  // Exactly 40 hex chars: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!signature || !secret || !/^[0-9a-fA-F]{40}$/.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}
