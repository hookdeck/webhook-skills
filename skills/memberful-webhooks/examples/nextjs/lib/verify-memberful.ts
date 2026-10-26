// Generated with: memberful-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify the X-Memberful-Webhook-Signature header: lowercase hex HMAC-SHA256 of the raw body bytes, keyed
 * with the webhook secret's UTF-8 bytes. Nothing else is signed (no timestamp, no id).
 */
export function verifyMemberfulSignature(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  secret: string | undefined = process.env.MEMBERFUL_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string') return false;
  // Validate length and alphabet before decoding (Buffer.from(..., 'hex') silently drops bad characters).
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // case-insensitive, as Hookdeck does
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
