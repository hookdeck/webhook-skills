import crypto from 'crypto';

/**
 * Verify a Zernio webhook signature.
 * X-Zernio-Signature is the lowercase hex HMAC-SHA256 of the raw body, keyed with your secret.
 */
export function verifyZernioWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws when lengths differ
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}
