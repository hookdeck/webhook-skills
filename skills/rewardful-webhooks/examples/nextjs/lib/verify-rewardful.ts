// Generated with: rewardful-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Rewardful signs the raw body: X-Rewardful-Signature = lowercase hex HMAC-SHA256 of the
 * request body, keyed with the endpoint's Signing Secret (used as UTF-8 bytes, no prefix).
 * Nothing else is signed, so there is no timestamp or replay window to check.
 */
export function verifyRewardfulSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.REWARDFUL_WEBHOOK_SECRET
): boolean {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex')); // both 32 bytes
}

// In-memory dedupe for the example; use a durable store (Redis, database) in production.
export const seenEvents = new Set<string>();
