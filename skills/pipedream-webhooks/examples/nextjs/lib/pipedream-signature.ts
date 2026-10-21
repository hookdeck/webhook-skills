// Generated with: pipedream-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';

// Pipedream recommends rejecting signatures older than 5 minutes.
export const TOLERANCE_SECONDS = 300;

export type VerificationResult = { valid: boolean; error?: string };

export type PipedreamConnectionEvent =
  | {
      event: 'CONNECTION_SUCCESS';
      connect_token: string;
      environment: string;
      connect_session_id: number;
      account: {
        id: string;
        name: string;
        external_id: string;
        healthy: boolean;
        dead: boolean | null;
        app: { id: string; name_slug: string; name: string; auth_type: string };
        created_at: string;
        updated_at: string;
      };
    }
  | {
      event: 'CONNECTION_ERROR';
      connect_token: string;
      environment: string;
      connect_session_id: number;
      error: string;
    };

/**
 * Parse x-pd-signature: "t=<unix seconds>,v1=<hex>".
 * Collects every v1 value so a future multi-signature header still verifies.
 */
export function parseSignatureHeader(header: string): { timestamp?: string; signatures: string[] } {
  let timestamp: string | undefined;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1' && value) signatures.push(value.toLowerCase());
  }

  return { timestamp, signatures };
}

/**
 * Verify a Pipedream Connect trigger webhook.
 *
 * Signed content: `${t}.${rawBody}` (the raw body, not re-serialised JSON)
 * Algorithm:      HMAC-SHA256 keyed with the signing key (UTF-8), hex digest
 */
export function verifyPipedreamSignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  signingKey: string,
  toleranceSeconds = TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
): VerificationResult {
  if (!header) {
    return { valid: false, error: 'Missing x-pd-signature header' };
  }

  const { timestamp, signatures } = parseSignatureHeader(header);
  if (!timestamp || !/^[0-9]+$/.test(timestamp) || signatures.length === 0) {
    return { valid: false, error: 'Malformed x-pd-signature header' };
  }

  // t is part of the signed content, so a replayed request can't refresh it.
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  const matched = signatures.some(
    (sig) =>
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  );

  return matched ? { valid: true } : { valid: false, error: 'Invalid signature' };
}

/** Constant-time string comparison for the connection-webhook URL token. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
