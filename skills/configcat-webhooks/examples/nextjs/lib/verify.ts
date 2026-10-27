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
  // The whole header is ONE digest. Two signing keys produce a comma-separated list and fail here.
  if (!SIGNATURE_PATTERN.test(signature)) {
    return { valid: false, error: 'Malformed signature' };
  }

  const expected = Buffer.from(computeSignature(secret, webhookId, timestamp, rawBody));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Opt-in replay window (off by default: Hookdeck retries and replays keep the original timestamp)
  if (toleranceSeconds > 0) {
    const sentAt = Number(timestamp);
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }
  return { valid: true };
}
