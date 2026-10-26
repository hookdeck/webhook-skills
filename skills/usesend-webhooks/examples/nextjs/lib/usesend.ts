import { createHmac, timingSafeEqual } from 'crypto';

// X-UseSend-Signature is `v1=<hex>`; the bare digest is accepted too.
const HEX_DIGEST = /^[0-9a-f]{64}$/;

/**
 * useSend signs `${X-UseSend-Timestamp}.${rawBody}` with HMAC-SHA256 and sends the
 * lowercase hex digest as `v1=<hex>`. The secret is used whole (including `whsec_`)
 * as a plain UTF-8 key. This is NOT Standard Webhooks.
 *
 * The message is built as bytes so the raw body is never decoded and re-encoded.
 */
export function verifyUseSend(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !timestamp || !secret) return false;
  const hex = (signature.startsWith('v1=') ? signature.slice(3) : signature).toLowerCase();
  // Validate length and alphabet first: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_DIGEST.test(hex)) return false;

  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.'),
    rawBody,
  ]);
  const expected = createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(hex, 'hex'));
}

// Opt-in replay window. X-UseSend-Timestamp is Unix MILLISECONDS.
export function withinTolerance(timestamp: string, toleranceSeconds: number): boolean {
  if (!toleranceSeconds || toleranceSeconds <= 0) return true;
  if (!/^\d+$/.test(timestamp)) return false;
  return Math.abs(Date.now() - Number(timestamp)) <= toleranceSeconds * 1000;
}
