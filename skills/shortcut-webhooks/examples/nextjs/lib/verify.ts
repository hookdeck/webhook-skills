import crypto from 'crypto';

/**
 * Verify a Shortcut webhook signature.
 * Payload-Signature is the hex HMAC-SHA256 of the raw request body (UTF-8),
 * keyed with the secret string entered when the webhook was created.
 */
export function verifyShortcutWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  // Timing-safe comparison; a length mismatch throws, which means invalid
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
