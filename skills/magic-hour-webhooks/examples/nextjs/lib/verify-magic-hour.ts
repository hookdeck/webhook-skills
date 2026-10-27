import crypto from 'crypto';

const HEX_64 = /^[0-9a-fA-F]{64}$/;

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

export interface VerifyConfig {
  secret?: string;
  /** Seconds. 0 or unset = no timestamp check (the default). */
  toleranceSeconds?: number;
}

/**
 * Verify a Magic Hour webhook.
 *
 * signature = lowercase hex HMAC-SHA256(secret, `${timestamp header}.${raw body}`)
 * This is NOT Standard Webhooks: the key is the secret's UTF-8 bytes (whsec_ prefix kept,
 * nothing decoded) and the digest is hex.
 */
export function verifyMagicHourSignature(
  rawBody: Buffer,
  headers: Headers,
  config: VerifyConfig = {}
): VerifyResult {
  const secret = config.secret !== undefined ? config.secret : process.env.MAGIC_HOUR_WEBHOOK_SECRET;
  const toleranceSeconds =
    config.toleranceSeconds !== undefined
      ? config.toleranceSeconds
      : Number(process.env.MAGIC_HOUR_WEBHOOK_TOLERANCE_SECONDS) || 0;

  if (!secret) return { valid: false, error: 'Webhook secret not configured' };

  const signature = headers.get('magic-hour-event-signature');
  const timestamp = headers.get('magic-hour-event-timestamp');
  if (!signature) return { valid: false, error: 'Missing magic-hour-event-signature header' };
  if (!timestamp) return { valid: false, error: 'Missing magic-hour-event-timestamp header' };

  // Check the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_64.test(signature)) {
    return { valid: false, error: 'Malformed signature (expected 64 hex characters)' };
  }

  // Signed message as bytes: header (latin1, untouched) + "." + the raw body bytes.
  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  const received = Buffer.from(signature, 'hex');

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Opt-in replay window. Off by default: retries and replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return { valid: false, error: 'Invalid timestamp' };
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > toleranceSeconds) return { valid: false, error: 'Timestamp outside tolerance' };
  }

  return { valid: true };
}
