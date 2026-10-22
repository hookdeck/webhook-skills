import crypto from 'crypto';

/**
 * Verify a FireHydrant webhook signature.
 * fh-signature is the bare hex HMAC-SHA256 of the raw request body, keyed with the webhook Secret.
 */
export function verifyFireHydrantWebhook(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; unequal lengths would make timingSafeEqual throw
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
