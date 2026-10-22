import crypto from 'crypto';

/**
 * Verify a WAHA webhook signature.
 *
 * WAHA sends X-Webhook-Hmac = hex(HMAC-SHA512(key, rawBody)) where the key is
 * used as a UTF-8 string, plus X-Webhook-Hmac-Algorithm: sha512.
 */
export function verifyWahaSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
  algorithm: string | null = 'sha512'
): boolean {
  if (!signature || !secret) {
    return false;
  }
  // WAHA documents sha512 only; reject anything else rather than guess
  if ((algorithm ?? 'sha512').toLowerCase() !== 'sha512') {
    return false;
  }

  const expected = crypto.createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}
