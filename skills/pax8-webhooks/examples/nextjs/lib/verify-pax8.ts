// Generated with: pax8-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type Pax8AuthConfig = Record<string, string | undefined>;

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Pax8 does not sign payloads. It sends the `authorization` value you set on the webhook
 * back in the `Authorization` header exactly as entered. Compare the WHOLE header value,
 * including any "Bearer " or "Basic " prefix: don't strip, parse or base64-decode it.
 * This authenticates the sender only; it gives no body integrity or replay protection.
 */
export function verifyPax8Request(
  headers: Headers,
  config: Pax8AuthConfig = process.env
): boolean {
  const expected = config.PAX8_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}

export interface Pax8Event {
  topic: string | null;
  sentAt: string | null;
}

/**
 * Pax8's Webhooks API reference types a delivery as WebhookPayload: accountId, url,
 * webhookId, sentAt, webhookTopic ({ id, topic, filters }) and payloadData. The topic
 * name is webhookTopic.topic. payloadData varies by topic and isn't documented, so treat
 * the notification as a prompt to fetch current state from the Pax8 API.
 */
export function classify(payload: Record<string, unknown>): Pax8Event {
  const wt = payload.webhookTopic as { topic?: unknown } | null | undefined;
  const topic =
    wt && typeof wt === 'object' && typeof wt.topic === 'string' && wt.topic
      ? wt.topic.toUpperCase()
      : null;
  const sentAt = typeof payload.sentAt === 'string' ? payload.sentAt : null;
  return { topic, sentAt };
}
