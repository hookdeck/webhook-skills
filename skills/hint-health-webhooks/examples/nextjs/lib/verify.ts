import crypto from 'crypto';

/**
 * Verify X-Hint-Signature: `sha256=` + hex(HMAC-SHA256(rawBody, webhooksSignatureKey)).
 * The bare digest (no prefix) is accepted too. Only the body is signed.
 */
export function verifyHintSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!header || !secret) return false;
  const digest = header.startsWith('sha256=') ? header.slice(7) : header;
  // Buffer.from(x, 'hex') silently drops bad characters, so check the format first
  if (!/^[0-9a-f]{64}$/i.test(digest)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), expected);
}
