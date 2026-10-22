import crypto from 'crypto';

/**
 * Verify a Yapily webhook signature.
 *
 * Yapily sends the lowercase hex HMAC-SHA256 of the raw body in `webhook-signature`,
 * keyed with the webhook secret as UTF-8. While a delayed secret reset is in progress it
 * also sends `webhook-rotation-signature`; either header may match.
 * This is NOT Standard Webhooks: there is no webhook-id or webhook-timestamp.
 */
export function verifyYapilyWebhook(
  rawBody: string,
  signatures: Array<string | null | undefined>,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  const expected = Buffer.from(
    crypto.createHmac('sha256', Buffer.from(secret, 'utf-8')).update(rawBody, 'utf8').digest('hex')
  );
  return signatures.some((sig) => {
    if (!sig) return false;
    const received = Buffer.from(sig.trim().toLowerCase());
    // timingSafeEqual throws on length mismatch, so check first
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
