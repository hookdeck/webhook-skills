import crypto from 'crypto';

/**
 * Verify Katana's x-sha2-signature: lowercase hex HMAC-SHA256 of the raw body bytes,
 * keyed with the webhook's token as UTF-8 (never hex-decoded). Nothing else is signed.
 */
export function verifyKatanaSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.KATANA_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  // Safe to decode: the format was validated above (exactly 64 hex characters).
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
