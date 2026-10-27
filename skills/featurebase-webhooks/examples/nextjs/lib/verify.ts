// Generated with: featurebase-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';

// Featurebase headers:
//   X-Webhook-Signature  lowercase hex HMAC-SHA256 (64 chars, no prefix)
//   X-Webhook-Timestamp  Unix seconds when Featurebase sent the request
// Signed content: `${X-Webhook-Timestamp}.${raw body}`, built as bytes.
// Key: the whole signing secret as UTF-8, including its `whsec_` prefix.
// This is NOT Standard Webhooks: nothing is base64-decoded and there is no id
// header, so the standardwebhooks and svix libraries do not apply.

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

export function verifyFeaturebaseWebhook(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined,
  toleranceSeconds = 0
): VerifyResult {
  if (!secret || !signature || !timestamp) {
    return { valid: false, error: 'Missing signature, timestamp or secret' };
  }
  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_SHA256.test(signature)) return { valid: false, error: 'Malformed signature' };

  // Header values are encoded latin1, exactly as received (never trimmed or parsed).
  const signedContent = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signedContent).digest();
  const provided = Buffer.from(signature.toLowerCase(), 'hex'); // hex is case-insensitive
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Opt-in only. Hookdeck retries and replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return { valid: false, error: 'Malformed timestamp' };
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }
  return { valid: true };
}
