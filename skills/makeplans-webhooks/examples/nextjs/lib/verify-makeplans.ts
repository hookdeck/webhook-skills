// Generated with: makeplans-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// MakePlans signs webhooks with X-MakePlans-Signature: "sha256=" + HMAC-SHA256
// of the request body, keyed with your Account secret (Setup > Webhooks; it is
// not the API key). MakePlans' docs show a 64-character lowercase hex example
// and no code, so hex is inferred from that example.

/** Verify X-MakePlans-Signature against the exact bytes MakePlans sent. */
export function verifyMakePlansSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  const key = String(secret ?? '').trim();
  // SHA-256 is 32 bytes: 64 hex characters.
  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(String(signature ?? '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

export interface MakePlansEvent {
  event: string;
  idempotency_id: string;
  generated_at?: string;
  performed_by?: Record<string, unknown>;
  data?: { object?: string; id?: number; [objectType: string]: unknown };
}

/** Dedupe on idempotency_id; read the object from data (the root copies are legacy). */
export function handleMakePlansEvent(event: MakePlansEvent) {
  console.log(`MakePlans ${event.event}: ${event.data?.object} ${event.data?.id}`);
  return { received: true, event_type: event.event, event_id: event.idempotency_id };
}
