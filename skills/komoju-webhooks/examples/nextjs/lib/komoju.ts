// Generated with: komoju-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify a KOMOJU webhook signature.
 *
 * KOMOJU sends `X-Komoju-Signature: <hex>` (no prefix) when the webhook has a secret token: the
 * lowercase hex HMAC-SHA256 of the raw request body bytes, keyed with that secret token. Nothing
 * else is signed.
 */
export function verifyKomojuSignature(
  rawBody: Buffer | Uint8Array,
  signatureHeader: string | null | undefined,
  secret: string
): boolean {
  // Check the exact shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (typeof signatureHeader !== 'string' || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(signatureHeader.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
