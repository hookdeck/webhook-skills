// Generated with: argyle-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const SIGNATURE_PATTERN = /^[0-9a-fA-F]{128}$/; // HMAC-SHA512 as hex = 128 characters

/**
 * Argyle signs the raw request body with HMAC-SHA512, keyed with the subscription
 * secret (UTF-8 bytes, used as-is), and sends the bare hex digest in X-Argyle-Signature.
 * Nothing else is signed (no timestamp, no id), so there is no replay window to check.
 * Hex is case-insensitive: validate the format, lowercase, compare in constant time.
 */
export function verifyArgyleSignature(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  secret: string | undefined = process.env.ARGYLE_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  if (typeof signature !== 'string' || !SIGNATURE_PATTERN.test(signature)) return false;

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature.toLowerCase(), 'utf8'); // validated ASCII hex, compared as text
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
