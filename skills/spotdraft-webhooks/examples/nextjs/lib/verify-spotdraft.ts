// Generated with: spotdraft-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// SpotDraft signs each webhook with one header:
//   X-SD-WEBHOOK-CONTENT-HASH: <hex HMAC-SHA512 of the raw body>
// The key is the hmac_key from GET /api/v2.1/public/webhooks/hmac_key/. It's
// base64: decode it to get the HMAC key.

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

export function verifySpotDraftWebhook(
  rawBody: Buffer | string,
  contentHash: string | null | undefined,
  hmacKey: string | undefined
): boolean {
  const key = decodeBase64Secret(hmacKey);
  const given = String(contentHash ?? '').trim();
  if (!key || !/^(?:[0-9a-fA-F]{2})+$/.test(given)) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest();
  return bytesEqual(Buffer.from(given, 'hex'), expected);
}

/**
 * SpotDraft's webhook guides don't publish the payload fields, so this example
 * assumes none. Log the top-level keys of the first real delivery, then dispatch
 * on the field that carries the activity (CONTRACT_CREATED, CONTRACT_EXECUTED,
 * ...). SpotDraft suggests deduplicating by delivery id or payload fingerprint;
 * a hash of the raw body is a fingerprint that doesn't depend on field names.
 */
export function handleEvent(payload: unknown, rawBody: Buffer): { received: true } {
  const fields = payload && typeof payload === 'object' ? Object.keys(payload) : [];
  const fingerprint = crypto.createHash('sha256').update(rawBody).digest('hex');
  console.log(`SpotDraft webhook ${fingerprint.slice(0, 16)} with fields: ${fields.join(', ')}`);
  return { received: true };
}
