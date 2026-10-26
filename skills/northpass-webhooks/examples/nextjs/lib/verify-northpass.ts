// Generated with: northpass-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Standard base64 of a 32-byte digest: exactly 43 characters plus one "=".
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Northpass signs the raw request body with HMAC-SHA256 keyed by the school's
 * shared secret and sends the padded base64 digest in X-Northpass-Hmac-SHA256.
 * Nothing else is signed (no timestamp), so there is no replay window to check.
 *
 * The header is validated for exact format first, then compared as a string in
 * constant time, so a value that merely decodes to the same bytes is rejected.
 */
export function verifyNorthpassSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret || !signature || !SIGNATURE_FORMAT.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
