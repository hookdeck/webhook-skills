import crypto from 'crypto';

/**
 * Verify the X-Signature header: base64(HMAC-SHA256(apiKey, rawBody)).
 * The key is the Delivereasy API key, used as UTF-8 bytes.
 */
export function verifyDelivereasy(
  rawBody: Buffer,
  signature: string | null | undefined,
  apiKey: string | undefined
): boolean {
  if (!apiKey || typeof signature !== 'string') return false;
  // Exact 44-char padded standard base64, checked before any comparison
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', apiKey).update(rawBody).digest('base64');
  // Both are 44 ASCII chars, so timingSafeEqual cannot throw
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
