import crypto from 'crypto';

/**
 * Verify the `Signature` header: hex(HMAC-SHA256(rawBody, profile ServerKey)).
 * The header is the bare digest (no prefix). Only the body is signed.
 */
export function verifyPayTabsSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!header || !secret) return false;
  // Buffer.from(x, 'hex') silently drops bad characters, so check the format first
  if (!/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(header, 'hex'), expected);
}
