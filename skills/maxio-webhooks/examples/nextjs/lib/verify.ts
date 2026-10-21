import crypto from 'crypto';

/**
 * Verify a Maxio (Chargify) webhook.
 * Header X-Chargify-Webhook-Signature-Hmac-Sha-256 = hex HMAC-SHA256 of the
 * raw form body, keyed with the Site Shared Key (raw string).
 */
export function verifyMaxio(
  rawBody: string,
  signatureHeader: string | null,
  sharedKey: string | undefined
): boolean {
  if (!signatureHeader || !sharedKey) return false;
  const expected = crypto.createHmac('sha256', sharedKey).update(rawBody).digest('hex');
  const provided = signatureHeader.trim().toLowerCase();
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
