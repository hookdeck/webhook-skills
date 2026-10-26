import crypto from 'crypto';

const HEX_128 = /^[0-9a-fA-F]{128}$/;

/**
 * Verify an OxaPay webhook signature.
 *
 * OxaPay sends `HMAC: <hex>` = lowercase hex HMAC-SHA512 of the raw request
 * body, keyed with your merchant API key (payment callbacks) or payout API
 * key (payout callbacks). The key is used as-is, as UTF-8 bytes.
 */
export function verifyOxapaySignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }
  // Validate the format first: exactly 128 hex characters (SHA-512)
  if (!HEX_128.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex'); // safe: format validated above

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
