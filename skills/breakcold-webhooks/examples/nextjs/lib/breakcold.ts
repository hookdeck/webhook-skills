// Generated with: breakcold-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

const SIGNATURE_PREFIX = /^sha256=/i;
const HEX_DIGEST = /^[0-9a-f]{64}$/i;

/**
 * Verify a Breakcold webhook signature.
 *
 * X-Webhook-Signature = "sha256=" + hex(HMAC-SHA256(secret, `${X-Webhook-Timestamp}.${rawBody}`))
 *
 * The signed message is built as bytes: the timestamp header exactly as received
 * (latin1), a literal ".", then the raw body bytes. The body is never decoded.
 */
export function verifyBreakcoldSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  timestampHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !timestampHeader || !secret) return false;

  // Accept the value with or without the `sha256=` prefix, then validate the
  // format BEFORE decoding: Buffer.from(x, 'hex') silently drops bad characters.
  const digest = signatureHeader.replace(SIGNATURE_PREFIX, '');
  if (!HEX_DIGEST.test(digest)) return false;

  const signed = Buffer.concat([
    Buffer.from(timestampHeader, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  const received = Buffer.from(digest, 'hex'); // case-insensitive; both are 32 bytes

  return crypto.timingSafeEqual(received, expected);
}

/**
 * Optional replay check. toleranceSeconds <= 0 (or NaN) disables it.
 * X-Webhook-Timestamp is Unix seconds.
 */
export function isTimestampFresh(
  timestampHeader: string,
  toleranceSeconds: number,
  nowSeconds: number = Date.now() / 1000
): boolean {
  if (!(toleranceSeconds > 0)) return true;
  if (!/^\d+$/.test(timestampHeader)) return false;
  return Math.abs(nowSeconds - Number(timestampHeader)) <= toleranceSeconds;
}
