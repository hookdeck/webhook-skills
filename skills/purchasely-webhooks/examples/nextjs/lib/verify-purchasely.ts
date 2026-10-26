// Generated with: purchasely-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Purchasely signs the X-PURCHASELY-TIMESTAMP header value followed by the raw body
 * (no separator) with HMAC-SHA256 and sends the lowercase hex digest, no prefix, in
 * X-PURCHASELY-REQUEST-SIGNATURE. The message is built as bytes so the body is never
 * decoded and re-encoded.
 */
export function computePurchaselySignature(
  timestamp: string,
  rawBody: Uint8Array,
  secret: string
): string {
  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), rawBody]);
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export function verifyPurchaselyRequest(
  headers: Headers,
  rawBody: Uint8Array,
  secret: string | undefined = process.env.PURCHASELY_WEBHOOK_SECRET,
  toleranceSeconds: number = Number(process.env.PURCHASELY_WEBHOOK_TOLERANCE_SECONDS) || 0
): boolean {
  if (!secret) return false; // never accept requests when unconfigured
  const signature = headers.get('x-purchasely-request-signature');
  const timestamp = headers.get('x-purchasely-timestamp');
  if (!signature || !timestamp) return false;
  if (!HEX_SHA256.test(signature)) return false; // validate before decoding

  // Opt-in replay window. Off by default: Hookdeck retries and replays resend the
  // original timestamp, so a fixed window would reject legitimate deliveries.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  const expected = Buffer.from(computePurchaselySignature(timestamp, rawBody, secret), 'hex');
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // 32 bytes, validated above
  return crypto.timingSafeEqual(expected, received);
}
