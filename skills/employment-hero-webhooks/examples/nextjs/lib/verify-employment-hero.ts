// Generated with: employment-hero-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Employment Hero signs each webhook with two headers:
//   X-EmploymentHero-Timestamp: <timestamp>
//   X-EmploymentHero-Signature: <base64 HMAC-SHA256 of "<timestamp>.<raw body>">
// The secret key from the Developer Portal is base64: decode it to get the HMAC key.

/**
 * The secret is issued base64-encoded: the HMAC key is its decoded bytes.
 * Node's base64 decoder skips characters it doesn't know and ignores stray
 * bits, so insist on canonical base64 instead of keying with the wrong bytes.
 * Surrounding whitespace (a pasted trailing newline) is trimmed.
 */
export function decodeBase64Secret(secret: string | undefined | null): Buffer | null {
  const value = String(secret ?? '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length === 0) return null;
  if (key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) return null;
  return key;
}

/** Constant-time comparison of two byte buffers that may differ in length. */
function bytesEqual(given: Buffer, expected: Buffer): boolean {
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function verifyEmploymentHeroWebhook(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string | undefined
): boolean {
  const key = decodeBase64Secret(secret);
  if (!key || !signature || !timestamp) return false;
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${timestamp}.`, 'utf8')
    .update(rawBody)
    .digest('base64');
  // Employment Hero's sample compares the base64 strings (secure_compare).
  return bytesEqual(Buffer.from(signature.trim(), 'utf8'), Buffer.from(expected, 'utf8'));
}

/**
 * Employment Hero lists its event names (Employee Created, Leave Request
 * Approved, ...) but doesn't publish a payload sample, so this example assumes
 * no field. Log the top-level keys of the first real delivery, then dispatch on
 * the field that names the event. A hash of the raw body makes a dedupe key that
 * doesn't depend on the payload's fields (Employment Hero retries up to 3 times).
 */
export function handleEvent(payload: unknown, rawBody: Buffer): { received: true } {
  const fields = payload && typeof payload === 'object' ? Object.keys(payload) : [];
  const dedupeKey = crypto.createHash('sha256').update(rawBody).digest('hex');
  console.log(`Employment Hero webhook ${dedupeKey.slice(0, 16)} with fields: ${fields.join(', ')}`);
  return { received: true };
}
