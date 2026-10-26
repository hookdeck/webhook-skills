// Generated with: schematic-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify a Schematic webhook.
 *
 * Signature = lowercase hex HMAC-SHA256(secret, rawBody + "+" + timestamp), sent as
 * the bare digest in X-Schematic-Webhook-Signature (no prefix). The timestamp is the
 * X-Schematic-Webhook-Timestamp header, used exactly as received.
 * toleranceSeconds = 0 (default) applies no replay window.
 */
export function verifySchematicSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string | undefined,
  toleranceSeconds = 0
): VerifyResult {
  if (!signature) return { valid: false, error: 'Missing signature header' };
  if (!timestamp) return { valid: false, error: 'Missing timestamp header' };
  if (!secret) return { valid: false, error: 'Webhook secret not configured' };

  // Validate format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_SHA256.test(signature)) return { valid: false, error: 'Malformed signature' };

  // Body bytes + "+" + header string (latin1, never trimmed or re-formatted).
  const signedContent = Buffer.concat([
    rawBody,
    Buffer.from('+', 'utf8'),
    Buffer.from(timestamp, 'latin1'),
  ]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signedContent).digest();
  const provided = Buffer.from(signature, 'hex'); // 64 hex chars -> 32 bytes, case-insensitive

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Opt-in only. Retries and Hookdeck replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return { valid: false, error: 'Malformed timestamp' };
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > toleranceSeconds) return { valid: false, error: 'Timestamp outside tolerance' };
  }

  return { valid: true };
}
