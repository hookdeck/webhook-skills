import crypto from 'crypto';

/**
 * Verify a TheirStack webhook signature.
 *
 * TheirStack signs the RAW request body with HMAC-SHA256 keyed on the webhook's
 * signing secret and sends "sha256=<hex>" in X-TheirStack-Signature-256.
 */
export function verifyTheirStackWebhook(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret || typeof signatureHeader !== 'string') return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  // Require exactly 64 hex chars before Buffer.from(x, 'hex'), which would
  // otherwise silently truncate invalid input.
  const received = signatureHeader.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
