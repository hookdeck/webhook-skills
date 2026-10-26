// Generated with: tiltify-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// Standard base64, padded: 32 bytes -> 43 characters + '='.
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;
// ISO-8601 UTC, e.g. 2023-04-18T16:49:00.617031Z
const ISO_UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Optional replay window in seconds. Off by default (unset or 0): Hookdeck
 * retries and replays resend the original headers, so a fixed window would
 * reject legitimate deliveries.
 */
export function toleranceFromEnv(): number {
  const value = Number(process.env.TILTIFY_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Verify a Tiltify webhook signature.
 *
 * Header:         X-Tiltify-Signature: <base64 digest> (padded, no prefix)
 * Signed content: `${X-Tiltify-Timestamp}.` + raw body bytes
 * Algorithm:      HMAC-SHA256 keyed with the secret's UTF-8 bytes (not hex-decoded)
 */
export function verifyTiltifySignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  timestampHeader: string | null | undefined,
  secret: string,
  toleranceSeconds = 0,
  nowMs = Date.now()
): VerifyResult {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Tiltify-Signature header' };
  }
  if (!timestampHeader) {
    return { valid: false, error: 'Missing X-Tiltify-Timestamp header' };
  }
  // Validate length and alphabet before decoding: Buffer.from(x, 'base64')
  // silently drops bad characters.
  if (!BASE64_SHA256.test(signatureHeader)) {
    return { valid: false, error: 'Malformed X-Tiltify-Signature header' };
  }

  if (toleranceSeconds > 0) {
    // Checked only when the opt-in tolerance is set.
    const match = ISO_UTC.exec(timestampHeader);
    if (!match) {
      return { valid: false, error: 'Malformed X-Tiltify-Timestamp header' };
    }
    const millis = (match[2] || '').slice(0, 3).padEnd(3, '0');
    const sentMs = Date.parse(`${match[1]}.${millis}Z`);
    if (!Number.isFinite(sentMs) || Math.abs(nowMs - sentMs) > toleranceSeconds * 1000) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  // Build the signed message as bytes: header value as latin1, raw body untouched.
  const signedContent = Buffer.concat([
    Buffer.from(timestampHeader, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = Buffer.from(
    crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signedContent).digest('base64'),
    'ascii',
  );
  // Compare the base64 text, as Hookdeck does: decoding would also accept a
  // non-canonical last character (stray low bits) that maps to the same digest.
  const received = Buffer.from(signatureHeader, 'ascii');

  return crypto.timingSafeEqual(expected, received)
    ? { valid: true }
    : { valid: false, error: 'Invalid signature' };
}
