// Generated with: kontent-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Kontent.ai signs webhooks with X-Kontent-ai-Signature: the base64 HMAC-SHA256
// of the raw body, keyed with the webhook's Secret used as text (it looks like
// base64, but don't decode it). Hash the bytes exactly as received: rewriting
// line endings breaks the signature.

/** Verify X-Kontent-ai-Signature against the exact bytes Kontent.ai sent. */
export function verifyKontentAiSignature(
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

export interface KontentAiNotification {
  data?: { system?: { id?: string; codename?: string; last_modified?: string; [key: string]: unknown } };
  message?: { environment_id?: string; object_type?: string; action?: string; delivery_slot?: string };
}

export interface KontentAiEvent {
  notifications?: KontentAiNotification[];
}

/** Each notification names one changed object and the event; they can arrive in batches. */
export function handleKontentAiEvent(event: KontentAiEvent) {
  const notifications = Array.isArray(event.notifications) ? event.notifications : [];
  for (const notification of notifications) {
    console.log(`${notification.message?.object_type} ${notification.data?.system?.codename}: ${notification.message?.action}`);
  }
  return { received: true, notifications: notifications.length };
}
