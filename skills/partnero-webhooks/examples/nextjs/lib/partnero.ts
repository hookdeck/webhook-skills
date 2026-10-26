// Generated with: partnero-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify a Partnero webhook signature.
 *
 * Partnero sends `Signature: <hex>`: the bare hex HMAC-SHA256 of the raw request body,
 * keyed with the webhook's signing secret. Nothing else is signed (no timestamp).
 */
export function verifyPartneroSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  // Check the shape first (64 hex chars); hex is case-insensitive, so compare lowercased
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase()),
    Buffer.from(expected)
  );
}
