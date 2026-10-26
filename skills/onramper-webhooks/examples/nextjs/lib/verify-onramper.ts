// Generated with: onramper-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Onramper signs the raw body: X-Onramper-Webhook-Signature is the bare lowercase hex
 * HMAC-SHA256 of the body, keyed with the secret's UTF-8 bytes. Nothing else is signed,
 * so there is no timestamp window to check.
 */
export function verifyOnramperSignature(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false; // exact length and alphabet first
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // validated: 32 bytes
  return timingSafeEqual(received, expected);
}
