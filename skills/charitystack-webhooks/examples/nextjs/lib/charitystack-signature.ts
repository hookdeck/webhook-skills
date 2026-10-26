// Generated with: charitystack-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

const SIGNATURE_PREFIX = 'sha256=';
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

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
  const value = Number(process.env.CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Verify a CharityStack webhook signature.
 *
 * Header:         X-Webhook-Signature: sha256=<hex> (bare hex is accepted too)
 * Signed content: `${X-Webhook-Timestamp}.` + raw body bytes
 * Algorithm:      HMAC-SHA256 keyed with the secret's UTF-8 bytes, hex digest
 */
export function verifyCharityStackSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  timestampHeader: string | null | undefined,
  secret: string,
  toleranceSeconds = 0,
  nowSeconds = Math.floor(Date.now() / 1000)
): VerifyResult {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Webhook-Signature header' };
  }
  if (!timestampHeader) {
    return { valid: false, error: 'Missing X-Webhook-Timestamp header' };
  }

  const digest = signatureHeader.startsWith(SIGNATURE_PREFIX)
    ? signatureHeader.slice(SIGNATURE_PREFIX.length)
    : signatureHeader;
  // Validate length and alphabet before decoding: Buffer.from(x, 'hex') silently
  // drops bad characters.
  if (!HEX_SHA256.test(digest)) {
    return { valid: false, error: 'Malformed X-Webhook-Signature header' };
  }

  if (toleranceSeconds > 0) {
    // Unix seconds. Checked only when the opt-in tolerance is set.
    if (!/^[0-9]+$/.test(timestampHeader)) {
      return { valid: false, error: 'Malformed X-Webhook-Timestamp header' };
    }
    if (Math.abs(nowSeconds - Number(timestampHeader)) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  // Build the signed message as bytes: header value as latin1, raw body untouched.
  const signedContent = Buffer.concat([
    Buffer.from(timestampHeader, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(signedContent)
    .digest();
  const received = Buffer.from(digest.toLowerCase(), 'hex');

  return crypto.timingSafeEqual(expected, received)
    ? { valid: true }
    : { valid: false, error: 'Invalid signature' };
}
