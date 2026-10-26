import crypto from 'crypto';

/**
 * Verify a Checkout Page webhook signature.
 *
 * Checkout Page sends `x-webhook-signature: sha256=<64 hex>`, the hex
 * HMAC-SHA256 of the raw body keyed with the signing secret. Nothing else
 * (including x-webhook-timestamp) is signed.
 */
export function verifyCheckoutPageWebhook(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  // Accept "sha256=<hex>" or the bare digest; validate length + alphabet before decoding
  const match = /^(?:sha256=)?([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1].toLowerCase(), 'hex'), expected);
}
