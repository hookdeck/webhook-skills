import crypto from 'crypto';

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify an Infinite Giving webhook.
 *
 * X-IG-Signature is `sha256=<hex>`: lowercase hex HMAC-SHA256, keyed with the
 * partner signing secret (UTF-8), over `{X-IG-Timestamp}.{raw body}`.
 * The signed message is built as bytes: the timestamp header exactly as received
 * (latin1), a literal ".", then the raw body bytes.
 */
export function verifyInfiniteGivingWebhook(
  rawBody: Buffer,
  timestamp: string | null,
  signature: string | null,
  secret: string | undefined,
  toleranceSeconds = 0
): VerifyResult {
  if (!secret) return { valid: false, error: 'Webhook secret not configured' };
  if (!timestamp) return { valid: false, error: 'Missing X-IG-Timestamp header' };
  if (!signature) return { valid: false, error: 'Missing X-IG-Signature header' };

  // The `sha256=` prefix is optional. Hex is case-insensitive.
  const hex = signature.replace(/^sha256=/, '').toLowerCase();

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    return { valid: false, error: 'Malformed signature' };
  }

  const signedContent = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest();
  const received = Buffer.from(hex, 'hex');

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Opt-in replay window. Off by default: retries and replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    const sent = /^\d+$/.test(timestamp) ? Number(timestamp) : NaN;
    const now = Math.floor(Date.now() / 1000);
    if (Number.isNaN(sent) || Math.abs(now - sent) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  return { valid: true };
}
