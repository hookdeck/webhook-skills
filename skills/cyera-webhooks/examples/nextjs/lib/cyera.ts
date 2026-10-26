// Generated with: cyera-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// Cyera Privacy signs: base64( HMAC-SHA256( secret, "{X-Webhook-Timestamp}:{raw body}" ) )
// and sends the bare, padded, standard-base64 digest in X-Webhook-Signature.
const SIGNATURE_RE = /^[A-Za-z0-9+/]{43}=$/;

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify a Cyera Privacy webhook.
 *
 * The signed message is built as BYTES: the timestamp header value (exact
 * string, latin1), a literal ":", then the raw body bytes as received. The body
 * is never decoded, parsed or re-serialized.
 *
 * @param rawBody           exact request bytes (await request.arrayBuffer())
 * @param signature         X-Webhook-Signature header value
 * @param timestamp         X-Webhook-Timestamp header value
 * @param secret            Webhook Secret, used as UTF-8 bytes
 * @param toleranceSeconds  0 = no timestamp window (default)
 */
export function verifyCyeraSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string,
  toleranceSeconds = 0
): VerifyResult {
  if (!signature) return { valid: false, error: 'Missing X-Webhook-Signature header' };
  if (!timestamp) return { valid: false, error: 'Missing X-Webhook-Timestamp header' };

  // Validate the format BEFORE decoding: Buffer.from(x, 'base64') silently
  // drops bad characters.
  if (!SIGNATURE_RE.test(signature)) {
    return { valid: false, error: 'Malformed X-Webhook-Signature (expected 44-char padded base64)' };
  }

  const signedMessage = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from(':', 'utf8'),
    rawBody,
  ]);
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(signedMessage)
    .digest();

  const received = Buffer.from(signature, 'base64');
  // Exact (case-sensitive, canonical) base64 only.
  if (received.length !== expected.length || received.toString('base64') !== signature) {
    return { valid: false, error: 'Malformed X-Webhook-Signature' };
  }
  if (!crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Optional replay window. Off by default: Hookdeck retries and replays resend
  // the original headers, so a fixed window would reject legitimate redeliveries.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) {
      return { valid: false, error: 'X-Webhook-Timestamp is not Unix seconds' };
    }
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > toleranceSeconds) return { valid: false, error: 'Timestamp outside tolerance' };
  }

  return { valid: true };
}
