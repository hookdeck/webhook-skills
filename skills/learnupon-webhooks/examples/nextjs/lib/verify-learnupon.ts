// Generated with: learnupon-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * LearnUpon signs the raw body with HMAC-SHA256 and sends the bare hex digest in
 * X-Webhook-Signature. Nothing else is signed (no timestamp), so there is no replay window.
 * The format is validated (exactly 64 hex characters) before it is decoded, because
 * Buffer.from(x, 'hex') silently drops invalid characters.
 */
export function verifyLearnuponSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.LEARNUPON_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // 32 bytes after validation
  return crypto.timingSafeEqual(expected, received);
}

// Demo dedupe store. Use a durable store (Redis, DB unique key) in production.
export const seenWebhookIds = new Set<string>();
