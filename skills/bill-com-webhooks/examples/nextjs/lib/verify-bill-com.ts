// Generated with: bill-com-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// BILL signs every event notification with x-bill-sha-signature: the base64
// HMAC-SHA256 of the body, keyed with the subscription's securityKey as text.
// BILL's guide checks it against the "unformatted (minified)" JSON because its
// example reads the body from a viewer that pretty-prints it. BILL sends the body
// compact, so HMAC the raw bytes exactly as received and never re-serialise.

/** Verify X-Bill-Sha-Signature against the exact bytes BILL sent. */
export function verifyBillSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  const key = String(secret ?? '').trim();
  // SHA-256 is 32 bytes: 44 base64 characters with one '='.
  const match = /^([A-Za-z0-9+/]{43}=)$/.exec(String(signature ?? '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'base64'), expected);
}

export interface BillEvent {
  metadata?: {
    eventId?: string;
    subscriptionId?: string;
    organizationId?: string;
    eventType?: string;
    version?: string;
  };
  payload?: Record<string, unknown>;
}

/** Dedupe on metadata.eventId; the payload depends on metadata.eventType. */
export function handleBillEvent(event: BillEvent) {
  const metadata = event.metadata ?? {};
  console.log(`BILL event ${metadata.eventType} in organization ${metadata.organizationId}`);
  return { received: true, event_type: metadata.eventType, event_id: metadata.eventId };
}
