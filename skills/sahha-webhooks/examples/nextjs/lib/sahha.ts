// Generated with: sahha-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

const SIGNATURE_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * Verify Sahha's X-Signature: lowercase hex HMAC-SHA256 of the raw body,
 * keyed with the Dashboard secret as UTF-8 bytes. No prefix, no timestamp.
 */
export function verifySahhaSignature(
  rawBody: Buffer,
  signature: string | null,
  secret: string
): boolean {
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (typeof signature !== 'string' || !SIGNATURE_PATTERN.test(signature)) return false;

  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  // Hex is case-insensitive; decoding to bytes handles that.
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
