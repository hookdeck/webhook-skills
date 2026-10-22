import crypto from 'crypto';

const SIGNATURE_PREFIX = 'hmac-sha256=';

/**
 * Verify a Mistral webhook signature.
 * Header format: x-mistral-signature: hmac-sha256=<hex>
 * Signed content: the raw request body, keyed with the endpoint secret (UTF-8).
 */
export function verifyMistralWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const received = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}
