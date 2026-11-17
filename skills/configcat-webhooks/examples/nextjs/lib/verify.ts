import crypto from 'crypto';

// Standard base64 (padded) SHA-256 digest: 43 characters + "="
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export interface VerifyInput {
  rawBody: Buffer;
  webhookId: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}

// ConfigCat signs: webhook ID + timestamp + raw body, concatenated with NO separators.
// The message is built as bytes: header values as latin1, body bytes exactly as received.
export function computeSignature(secret: string, webhookId: string, timestamp: string, rawBody: Buffer): string {
  const message = Buffer.concat([
    Buffer.from(webhookId, 'latin1'),
    Buffer.from(timestamp, 'latin1'),
    rawBody,
  ]);
  // The key is the whole secret (including configcat_whsk_) as UTF-8 bytes
  return crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest('base64');
}

export function verifyConfigCatWebhook(input: VerifyInput): { valid: boolean; error?: string } {
  const { rawBody, webhookId, timestamp, signature, secret, toleranceSeconds = 0 } = input;
  if (!webhookId || !timestamp || !signature) {
    return { valid: false, error: 'Missing X-ConfigCat-Webhook-ID, -Timestamp or -Signature-V1 header' };
  }
  // A comma-separated list, one signature per signing key (two during a key rotation).
  const candidates = signature.split(',').map((s) => s.trim()).filter((s) => SIGNATURE_PATTERN.test(s));
  if (candidates.length === 0) {
    return { valid: false, error: 'Malformed signature' };
  }

  const expected = Buffer.from(computeSignature(secret, webhookId, timestamp, rawBody));
  const matched = candidates.some((candidate) => {
    const received = Buffer.from(candidate);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  });
  if (!matched) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Opt-in replay window, off by default: ConfigCat recommends a check but sets no window
  if (toleranceSeconds > 0) {
    const sentAt = Number(timestamp);
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }
  return { valid: true };
}
