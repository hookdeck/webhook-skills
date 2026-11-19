// Generated with: fedex-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// FedEx Advanced Integrated Visibility (AIV) webhooks carry fdx-signature: the
// base64 HMAC-SHA256 of the payload, keyed with the security token you set on
// the webhook (or typed into "Try this webhook"). One sentence in FedEx's docs
// says "hex encoding", but the formula, the Java sample and the FAQ all say
// base64.

/** Verify fdx-signature against the exact bytes FedEx sent. */
export function verifyFedExSignature(
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

export type FedExEvent = Record<string, unknown>;

/** Map the fields you need from FedEx's downloadable tracking schema. */
export function handleFedExEvent(event: FedExEvent) {
  console.log(`FedEx tracking notification with fields: ${Object.keys(event).join(', ')}`);
  return { received: true };
}
