import crypto from 'crypto';

/**
 * Verify Forgejo webhook signature (X-Forgejo-Signature: bare hex HMAC-SHA256 of the raw body)
 */
export function verifyForgejoWebhook(
  rawBody: Buffer,
  signature: string | null,
  secret: string | undefined
): boolean {
  // Forgejo sends the header with an empty value when no secret is configured
  if (!secret || !signature || !/^[0-9a-fA-F]{64}$/.test(signature)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(rawBody)
    .digest();

  // Format is validated above, so both buffers are 32 bytes
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase(), 'hex'), expected);
}
