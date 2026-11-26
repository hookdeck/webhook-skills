// Generated with: juniper-mist-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Juniper Mist signs http-post webhooks that have a Secret set with two headers:
//   X-Mist-Signature-v2  lowercase hex HMAC-SHA256(secret, raw body)
//   X-Mist-Signature     lowercase hex HMAC-SHA1(secret, raw body)  (legacy v1)
// This example verifies v2 only. Webhooks without a secret, and the OAuth2 and
// Splunk webhook types, carry no signature.

/** Verify X-Mist-Signature-v2 against the exact bytes Juniper Mist sent. */
export function verifyMistSignature(
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

export interface MistWebhook {
  topic: string;
  events?: Array<Record<string, unknown>>;
}

/** One POST carries { topic, events: [...] }; event fields depend on the topic. */
export function handleMistEvent(body: MistWebhook) {
  const events = Array.isArray(body.events) ? body.events : [];
  for (const event of events) {
    console.log(`Mist ${body.topic} event: ${String(event.type ?? event.message ?? '')}`);
  }
  return { received: true, topic: body.topic, events: events.length };
}
