import crypto from 'crypto';

// A PayNow signature is the 44-character padded standard base64 of a SHA-256 digest
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify PayNow's PayNow-Signature header.
 *
 * Signed message (as bytes): PayNow-Timestamp header value + "." + raw request body.
 * Signature: base64(HMAC-SHA256(secret, message)), the whole header value.
 */
export function verifyPaynowSignature(
  rawBody: Buffer,
  timestamp: string | null,
  signature: string | null,
  secret: string | undefined,
  toleranceSeconds = 0
): VerifyResult {
  if (!secret) return { valid: false, error: 'Webhook secret not configured' };
  if (!signature || !timestamp) return { valid: false, error: 'Missing signature or timestamp header' };
  // Validate the format before decoding: Buffer.from(x, 'base64') silently drops bad characters
  if (!SIGNATURE_PATTERN.test(signature)) return { valid: false, error: 'Malformed signature' };

  // Optional replay protection. Off by default: Hookdeck retries and replays resend the
  // original headers, so a fixed window would reject legitimate deliveries.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return { valid: false, error: 'Invalid timestamp' };
    if (Math.abs(Date.now() - Number(timestamp)) > toleranceSeconds * 1000) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  // Build the signed message as bytes: header as latin1, raw body untouched
  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.', 'utf8'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  const provided = Buffer.from(signature, 'base64');
  // Reject non-canonical encodings (stray low bits in the last character): core compares base64 exactly
  if (provided.toString('base64') !== signature) return { valid: false, error: 'Malformed signature' };

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}
