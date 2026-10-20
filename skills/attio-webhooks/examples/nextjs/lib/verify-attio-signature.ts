import crypto from 'crypto';

/**
 * Verify an Attio webhook signature.
 * Attio-Signature = hex(HMAC-SHA256(webhook_secret, raw_body)), no prefix or timestamp.
 */
export function verifyAttioSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  // Reject anything that isn't a 64-char hex digest (timingSafeEqual throws on length mismatch)
  if (!/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature.toLowerCase(), 'hex'),
    Buffer.from(expected, 'hex')
  );
}
