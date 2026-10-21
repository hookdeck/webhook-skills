// Generated with: revenuecat-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// RevenueCat re-signs every delivery attempt (including retries), so `t` is
// always recent. 300 seconds only has to cover clock skew and request latency.
export const TOLERANCE_SECONDS = 300;

export type VerifyResult = { valid: true } | { valid: false; error: string };

export interface RevenueCatEvent {
  id: string;
  type: string;
  event_timestamp_ms: number;
  app_user_id?: string;
  product_id?: string;
  new_product_id?: string;
  cancel_reason?: string;
  expiration_reason?: string;
  environment?: 'SANDBOX' | 'PRODUCTION';
  [key: string]: unknown;
}

export interface RevenueCatWebhookBody {
  api_version: string;
  event: RevenueCatEvent;
}

/**
 * Parse X-RevenueCat-Webhook-Signature: "t=<unix seconds>,v1=<hex>".
 * Each field is split on its first "=" only.
 */
export function parseSignatureHeader(header: string) {
  let timestamp: string | undefined;
  let timestampCount = 0;
  const signatures: string[] = [];

  for (const field of header.split(',')) {
    const separator = field.indexOf('=');
    if (separator === -1) continue;
    const key = field.slice(0, separator).trim();
    const value = field.slice(separator + 1).trim();
    if (key === 't') {
      timestamp = value;
      timestampCount += 1;
    } else if (key === 'v1' && value) {
      signatures.push(value.toLowerCase());
    }
  }

  return { timestamp, timestampCount, signatures };
}

/**
 * Verify a RevenueCat HMAC webhook signature.
 *
 * Signed content: `${t}.${rawBody}` (raw bytes, not re-serialised JSON)
 * Algorithm:      HMAC-SHA256 keyed with the signing secret (UTF-8), hex digest
 */
export function verifyRevenueCatSignature(
  rawBody: string | Buffer,
  header: string | null,
  secret: string,
  toleranceSeconds = TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
): VerifyResult {
  if (!header) {
    return { valid: false, error: 'Missing X-RevenueCat-Webhook-Signature header' };
  }

  const { timestamp, timestampCount, signatures } = parseSignatureHeader(header);
  if (timestampCount !== 1 || !timestamp || !/^[0-9]+$/.test(timestamp) || signatures.length === 0) {
    return { valid: false, error: 'Malformed X-RevenueCat-Webhook-Signature header' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  const matched = signatures.some(
    (sig) =>
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  );
  if (!matched) {
    return { valid: false, error: 'Invalid signature' };
  }

  // `t` is inside the signed content, so it can't be refreshed on a replay.
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  return { valid: true };
}

/**
 * Compare the Authorization header with the value configured on the
 * integration. RevenueCat sends that value verbatim on every request.
 * Hash both sides so the comparison is constant time regardless of length.
 */
export function verifyAuthorizationHeader(received: string | null, expected: string): VerifyResult {
  if (!received) {
    return { valid: false, error: 'Missing Authorization header' };
  }
  const a = crypto.createHash('sha256').update(received).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b)
    ? { valid: true }
    : { valid: false, error: 'Invalid Authorization header' };
}
