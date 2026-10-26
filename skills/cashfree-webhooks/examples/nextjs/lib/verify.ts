// Generated with: cashfree-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// 44 characters: 43 base64 characters plus one "=" (a 32-byte digest).
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

/**
 * Verify a Cashfree delivery (Payment Gateway, Payouts V2, Secure ID, PPI).
 *
 * signature = base64(HMAC-SHA256(secret, x-webhook-timestamp + rawBody)), compared
 * as the whole `x-webhook-signature` header. Timestamp first, body second, NO
 * separator. Works on bytes; never pass a re-serialised body.
 *
 * @param rawBody - exact request body bytes (from request.arrayBuffer())
 * @param signature - x-webhook-signature header value
 * @param timestamp - x-webhook-timestamp header value, used exactly as received
 * @param secret - Cashfree client secret (Partner API key for partner webhooks)
 * @param toleranceSeconds - 0 (default) disables the replay window
 */
export function verifyCashfreeSignature(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string,
  toleranceSeconds = 0
): VerifyResult {
  if (!signature || !timestamp) {
    return { ok: false, error: 'Missing x-webhook-signature or x-webhook-timestamp' };
  }
  if (!SIGNATURE_PATTERN.test(signature)) {
    return { ok: false, error: 'Malformed x-webhook-signature' };
  }

  const signedContent = Buffer.concat([Buffer.from(timestamp, 'latin1'), rawBody]);
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(signedContent)
    .digest('base64');

  const a = Buffer.from(expected, 'latin1');
  const b = Buffer.from(signature, 'latin1');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Signature mismatch' };
  }

  // Opt-in only. Cashfree does not state the timestamp unit, so accept seconds or
  // milliseconds. Retries resend the original timestamp, so this rejects them once old.
  if (toleranceSeconds > 0) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric)) {
      return { ok: false, error: 'Timestamp is not numeric' };
    }
    const seconds = numeric > 1e11 ? numeric / 1000 : numeric;
    if (Math.abs(Date.now() / 1000 - seconds) > toleranceSeconds) {
      return { ok: false, error: 'Timestamp outside tolerance' };
    }
  }
  return { ok: true };
}
