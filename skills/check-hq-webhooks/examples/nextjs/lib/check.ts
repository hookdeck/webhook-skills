import crypto from 'crypto';

/**
 * Verify the Check-Signature header.
 * Check sends the lowercase hex HMAC-SHA256 of the raw request body, keyed with
 * the Webhook Config's `key` used as UTF-8 text (not hex-decoded).
 */
export function verifyCheckWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
  key: string | undefined
): boolean {
  if (!signatureHeader || !key) {
    return false;
  }

  const expected = crypto.createHmac('sha256', key).update(rawBody).digest('hex');
  const received = signatureHeader.trim().toLowerCase();

  // timingSafeEqual throws on length mismatch, so check first
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
