// Generated with: klarna-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Klarna Notifications API webhooks carry Klarna-Signature: the lowercase hex
// HMAC-SHA256 of the raw body, keyed with the signing key (the signing_key that
// createSigningKey returned) as UTF-8 text. Klarna-Signing-Key-Id names the key.

/** Verify Klarna-Signature against the exact bytes Klarna sent. */
export function verifyKlarnaSignature(
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

export interface KlarnaEvent {
  metadata?: {
    event_id?: string;
    event_type?: string;
    event_version?: string;
    occurred_at?: string;
    webhook_id?: string;
    live?: boolean;
    [key: string]: unknown;
  };
  payload?: Record<string, unknown>;
}

/** Store keyed on metadata.event_id, acknowledge, then process asynchronously. */
export function handleKlarnaEvent(event: KlarnaEvent) {
  const metadata = event.metadata ?? {};
  console.log(`Klarna event ${metadata.event_type} (${metadata.event_version})`);
  return { received: true, event_type: metadata.event_type, event_id: metadata.event_id };
}
