// Generated with: authorize-net-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Authorize.net signs webhooks with X-ANET-Signature: "sha512=" followed by the
// uppercase hex HMAC-SHA512 of the raw body, keyed with your Signature Key used
// as text (the 128-character string itself, not hex-decoded). Hex is compared
// case-insensitively, and the "sha512=" prefix is matched in either case.

/** Verify X-ANET-Signature against the exact bytes Authorize.net sent. */
export function verifyAuthorizeNetSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  const key = String(secret ?? '').trim();
  // SHA-512 is 64 bytes: 128 hex characters.
  const match = /^sha512=([0-9a-fA-F]{128})$/i.exec(String(signature ?? '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

export interface AuthorizeNetEvent {
  notificationId: string;
  eventType: string;
  eventDate?: string;
  webhookId?: string;
  payload?: { entityName?: string; id?: string; responseCode?: number; authAmount?: number; [key: string]: unknown };
}

/** payload is a summary (entityName + id); fetch the record from the API for more. Dedupe on notificationId. */
export function handleAuthorizeNetEvent(event: AuthorizeNetEvent) {
  console.log(`Authorize.net ${event.eventType} for ${event.payload?.entityName} ${event.payload?.id}`);
  return { received: true, event_type: event.eventType, event_id: event.notificationId };
}
