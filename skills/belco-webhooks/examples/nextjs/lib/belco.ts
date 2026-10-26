// Generated with: belco-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify a Belco webhook signature.
 *
 * Belco sends `x-hook-signature: <hex>` (no prefix): the lowercase hex HMAC-SHA256 of the raw
 * request body bytes, keyed with the webhook's secret. Nothing else is signed.
 */
export function verifyBelcoSignature(
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
