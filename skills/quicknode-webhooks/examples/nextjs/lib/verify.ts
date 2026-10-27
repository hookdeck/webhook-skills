// Generated with: quicknode-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const HEX_64 = /^[0-9a-fA-F]{64}$/;

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Parse X-QN-Timestamp for the opt-in tolerance check. The docs do not state the unit,
 * so this accepts epoch seconds, epoch milliseconds (>= 1e11) or an ISO 8601 string.
 */
function parseTimestampMs(value: string): number | null {
  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    return n >= 1e11 ? n : n * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Verify a Quicknode Streams / Webhooks delivery.
 * X-QN-Signature is the bare lowercase hex HMAC-SHA256, keyed with the security token (UTF-8),
 * of: X-QN-Nonce + X-QN-Timestamp + raw body, concatenated with no separators.
 * @param rawBody - Raw request body bytes, exactly as received
 * @param headers - Request headers
 * @param secret - The stream's or webhook's security token
 * @param toleranceSeconds - Opt-in maximum timestamp age; 0 or unset = off
 */
export function verifyQuicknodeWebhook(
  rawBody: Buffer,
  headers: Headers,
  secret: string | undefined,
  toleranceSeconds = 0
): VerifyResult {
  const signature = headers.get('x-qn-signature');
  const nonce = headers.get('x-qn-nonce');
  const timestamp = headers.get('x-qn-timestamp');

  if (!secret) return { valid: false, error: 'No secret configured' };
  if (!signature || !nonce || !timestamp) {
    return { valid: false, error: 'Missing signature, nonce or timestamp header' };
  }
  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!HEX_64.test(signature)) {
    return { valid: false, error: 'Malformed signature' };
  }

  // Header values are encoded latin1 and the body is used as the raw bytes received
  const signedContent = Buffer.concat([
    Buffer.from(nonce, 'latin1'),
    Buffer.from(timestamp, 'latin1'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // validated above: 32 bytes

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  if (toleranceSeconds > 0) {
    const sentAt = parseTimestampMs(timestamp);
    if (sentAt === null || Math.abs(Date.now() - sentAt) > toleranceSeconds * 1000) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  return { valid: true };
}
