// Generated with: bitgo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// BitGo signs notifications with X-Signature-SHA256 once the enterprise (or
// organization) has a webhook secret from POST /api/v2/webhook/secret. The value
// is 64 lowercase hex characters. BitGo documents verifying it only through its
// API (POST /api/v2/webhook/{webhookId}/verify); this local check, a hex
// HMAC-SHA256 of the raw body keyed with the secret as text, is inferred.

/** Verify X-Signature-SHA256 against the exact bytes BitGo sent. */
export function verifyBitGoSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  const key = String(secret ?? '').trim();
  // SHA-256 is 32 bytes: 64 hex characters.
  const match = /^([0-9a-fA-F]{64})$/.exec(String(signature ?? '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

export interface BitGoEvent {
  type: string;
  wallet?: string;
  coin?: string;
  transfer?: string;
  hash?: string;
  state?: string;
  simulation?: boolean;
  [key: string]: unknown;
}

/** Fetch the transfer from BitGo's API before acting on it. */
export function handleBitGoEvent(event: BitGoEvent) {
  console.log(`BitGo ${event.type} webhook for wallet ${event.wallet}`);
  return { received: true, type: event.type, wallet: event.wallet };
}
