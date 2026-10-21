import crypto from 'crypto';

/**
 * Verify X-LD-Signature: HMAC-SHA256 hex digest of the raw body, keyed with the webhook secret.
 */
export function verifyLaunchDarklyWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // timingSafeEqual throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
