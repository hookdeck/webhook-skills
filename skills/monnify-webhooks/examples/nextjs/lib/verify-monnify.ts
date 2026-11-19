// Generated with: monnify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Monnify signs webhooks with monnify-signature: the lowercase hex HMAC-SHA512
// of the raw (compact JSON) body, keyed with your client secret key as text.
// Monnify's docs describe it loosely as "SHA-512(client secret key + object of
// request body)", but its code samples and published test vector use HMAC.
// Monnify's sandbox sends no monnify-signature header at all.

/** Verify monnify-signature against the exact bytes Monnify sent. */
export function verifyMonnifySignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  const key = String(secret ?? '').trim();
  // SHA-512 is 64 bytes: 128 hex characters.
  const match = /^([0-9a-fA-F]{128})$/.exec(String(signature ?? '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

export interface MonnifyEvent {
  eventType: string;
  eventData?: {
    transactionReference?: string;
    paymentReference?: string;
    paymentStatus?: string;
    amountPaid?: string;
    currency?: string;
    [key: string]: unknown;
  };
}

/** Confirm paymentStatus and amountPaid before fulfilling; dedupe on transactionReference. */
export function handleMonnifyEvent(event: MonnifyEvent) {
  const data = event.eventData ?? {};
  console.log(`Monnify ${event.eventType} for ${data.transactionReference}`);
  return { received: true, event_type: event.eventType, reference: data.transactionReference };
}
