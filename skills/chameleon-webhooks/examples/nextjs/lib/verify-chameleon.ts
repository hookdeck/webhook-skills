// Generated with: chameleon-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Chameleon signs the RAW request body: X-Chameleon-Signature is the bare hex
 * HMAC-SHA256 of the body, keyed with the Webhook Secret (UTF-8 bytes, as-is).
 * Nothing else (no timestamp, no id) is part of the signed content.
 */
export function verifyChameleonSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.CHAMELEON_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  // The signature is validated as 64 hex chars, so both buffers are 32 bytes.
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

/**
 * Optional replay check from Chameleon's sample: sent_at must be within N seconds of now.
 * Off unless CHAMELEON_SENT_AT_TOLERANCE_SECONDS is set. Runs after the signature check.
 */
export function sentAtWithinTolerance(
  sentAt: unknown,
  toleranceSeconds: number,
  now: number = Date.now()
): boolean {
  const ms = typeof sentAt === 'string' ? Date.parse(sentAt) : NaN;
  if (Number.isNaN(ms)) return false;
  return Math.abs(now - ms) <= toleranceSeconds * 1000;
}

// Demo dedupe store. Use a durable store (Redis, DB unique key) in production.
export const seenEventIds = new Set<string>();
