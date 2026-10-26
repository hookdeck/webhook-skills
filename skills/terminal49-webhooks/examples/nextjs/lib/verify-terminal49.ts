// Generated with: terminal49-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Terminal49 signs the raw request body with HMAC-SHA256, keyed with the webhook's `secret`
 * (UTF-8 bytes, used as-is), and sends the bare hex digest in X-T49-Webhook-Signature.
 * No timestamp is signed, so there is no replay window to check.
 */
export function verifyTerminal49Signature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.TERMINAL49_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  // Validate the format first: Buffer.from(x, 'hex') silently drops bad characters.
  if (typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // hex is case-insensitive
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
