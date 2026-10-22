import crypto from 'crypto';

/**
 * Verify a Help Scout webhook signature.
 * Help Scout sends the base64 HMAC-SHA1 of the raw body in X-HelpScout-Signature.
 */
export function verifyHelpScoutWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    // Different lengths mean the signature is invalid
    return false;
  }
}
