import crypto from 'crypto';

/**
 * Verify a Ramp webhook signature.
 *
 * Ramp sends X-Ramp-Signature = hex(HMAC-SHA256(secret, rawBody)), where the
 * secret is the raw string returned when the subscription was created.
 */
export function verifyRampSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
