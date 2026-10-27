import crypto from 'node:crypto';

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify an Ultravox webhook.
 *
 * Signature = lowercase hex HMAC-SHA256(secret, rawBody || X-Ultravox-Webhook-Timestamp),
 * with NO separator between the body bytes and the timestamp string.
 */
export function verifyUltravoxWebhook(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string,
  toleranceSeconds = 0
): VerifyResult {
  if (!signature) return { valid: false, error: 'Missing X-Ultravox-Webhook-Signature header' };
  if (!timestamp) return { valid: false, error: 'Missing X-Ultravox-Webhook-Timestamp header' };

  // The whole header is one digest: exactly 64 hex characters, nothing else
  if (!HEX_DIGEST.test(signature)) return { valid: false, error: 'Malformed signature' };

  // Signed message as bytes: raw body, then the timestamp header exactly as received (latin1)
  const signedContent = Buffer.concat([rawBody, Buffer.from(timestamp, 'latin1')]);
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // safe: format validated above

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Opt-in replay window. Off by default: Hookdeck retries/replays keep the original timestamp.
  if (toleranceSeconds > 0) {
    const sentAt = Date.parse(timestamp); // ISO 8601
    if (Number.isNaN(sentAt) || Math.abs(Date.now() - sentAt) > toleranceSeconds * 1000) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }
  return { valid: true };
}
