import crypto from 'crypto';

/**
 * Verify the OhDear-Signature header: the bare lowercase hex HMAC-SHA256 of the
 * raw request body, keyed with the team signing secret (used as UTF-8 bytes).
 */
export function verifyOhDearSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string
): boolean {
  // Validate format first: Buffer.from(x, 'hex') silently drops bad characters
  if (!signatureHeader || !/^[0-9a-fA-F]{64}$/.test(signatureHeader)) {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
