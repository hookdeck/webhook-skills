// Generated with: tokity-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const SIGNATURE_PREFIX = 'sha256=';
// Standard padded base64 of a 32-byte digest: 43 characters plus one "=".
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Tokity signs the raw request body with HMAC-SHA256, keyed with the webhook's secret
 * (its UTF-8 bytes, used as-is), and sends "sha256=" + standard base64 in `x-dd-signature`.
 * Nothing else is signed: no timestamp and no id.
 *
 * The bare digest (no "sha256=") is accepted too. The value is checked against the exact
 * 44-character base64 form first, then the base64 STRINGS are compared in constant time.
 * Decoding is avoided on purpose: Buffer.from(x, 'base64') silently drops bad characters
 * and accepts non-canonical last characters.
 */
export function verifyTokitySignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined = process.env.TOKITY_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signatureHeader !== 'string') return false;

  const received = signatureHeader.startsWith(SIGNATURE_PREFIX)
    ? signatureHeader.slice(SIGNATURE_PREFIX.length)
    : signatureHeader;
  if (!BASE64_SHA256.test(received)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
