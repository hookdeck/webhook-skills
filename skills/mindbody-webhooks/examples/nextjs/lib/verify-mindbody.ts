// Generated with: mindbody-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Mindbody delivers events as POSTs with X-Mindbody-Signature:
//   "sha256=" + base64(HMAC-SHA256(raw body))
// keyed with the subscription's messageSignatureKey used as UTF-8 text. The key
// looks like base64, but Mindbody's sample does not decode it.
// Mindbody also sends a HEAD request to the webhook URL when a subscription is
// created (and, per its error table, when one is changed with PATCH). The URL must
// answer with a 2xx, or the API call fails with invalidWebhookURLNoResponse.

/** Verify X-Mindbody-Signature against the exact bytes Mindbody sent. */
export function verifyMindbodySignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  const key = String(secret ?? '').trim();
  // SHA-256 is 32 bytes: 44 base64 characters with one '='.
  const match = /^sha256=([A-Za-z0-9+/]{43}=)$/.exec(String(signature ?? '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'base64'), expected);
}

export interface MindbodyEvent {
  messageId: string;
  eventId: string;
  eventSchemaVersion?: number;
  eventInstanceOriginationDateTime?: string;
  transactionKey?: string;
  eventData?: { siteId?: number; [key: string]: unknown };
}

/** Same envelope for every event: dedupe on messageId, switch on eventId. */
export function handleMindbodyEvent(event: MindbodyEvent) {
  console.log(`Mindbody event ${event.eventId} at site ${event.eventData?.siteId}`);
  return { received: true, event_type: event.eventId, event_id: event.messageId };
}
