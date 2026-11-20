// Generated with: strike-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Strike (strike.me, Bitcoin/Lightning payments) signs every webhook with
// X-Webhook-Signature: the lowercase hex HMAC-SHA256 of the raw request body,
// keyed with the `secret` YOU chose when creating the subscription
// (POST /v1/subscriptions). Not the API key. No timestamp, no prefix.

/** Verify X-Webhook-Signature against the exact bytes Strike sent. */
export function verifyStrikeSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secrets: string[]
): boolean {
  // SHA-256 is 32 bytes: 64 hex characters. Anything else is rejected up front,
  // so timingSafeEqual never sees buffers of different lengths (it would throw).
  const value = String(signature ?? '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const received = Buffer.from(value, 'hex');
  return secrets.some((secret) => {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    return crypto.timingSafeEqual(received, expected);
  });
}

/** Current secret, plus the previous one while you rotate it. */
export function configuredSecrets(): string[] {
  return [process.env.STRIKE_WEBHOOK_SECRET, process.env.STRIKE_WEBHOOK_SECRET_PREVIOUS].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  );
}

/** WebhookEvent (v1). `data` has no schema in Strike's OpenAPI: read it defensively. */
export interface StrikeWebhookEvent {
  id: string;
  eventType: string;
  webhookVersion: string;
  data?: { entityId?: string; changes?: string[]; [key: string]: unknown };
  created: string;
  deliverySuccess?: boolean | null;
}

// The 14 event types in Strike's "Supported Events" table, mapped to the API
// path that resolves data.entityId. Webhooks carry no entity data: fetch it.
export const EVENT_RESOURCES: Record<string, string> = {
  'invoice.created': '/v1/invoices',
  'invoice.updated': '/v1/invoices',
  'payment-method.bank.created': '/v1/payment-methods/bank',
  'payment-method.bank.updated': '/v1/payment-methods/bank',
  'payout.created': '/v1/payouts',
  'payout.updated': '/v1/payouts',
  'payout-originator.created': '/v1/payout-originators',
  'payout-originator.updated': '/v1/payout-originators',
  'currency-exchange-quote.updated': '/v1/currency-exchange-quotes',
  'payment.created': '/v1/payments',
  'payment.updated': '/v1/payments',
  'deposit.updated': '/v1/deposits',
  'receive-request.receive-pending': '/v1/receive-requests',
  'receive-request.receive-completed': '/v1/receive-requests',
};

// Demo-only dedupe store. Use a database unique constraint on event.id in production.
export const seenEventIds = new Set<string>();

/**
 * Runs AFTER the response (via after()). Strike cancels a delivery after
 * 5 seconds, so the fetch-back API call must never happen before responding.
 */
export async function processEvent(event: StrikeWebhookEvent): Promise<unknown> {
  const basePath = EVENT_RESOURCES[event.eventType];
  const entityId = event.data?.entityId;
  if (!basePath || !entityId) return null;

  const apiKey = process.env.STRIKE_API_KEY;
  if (!apiKey) {
    console.error('STRIKE_API_KEY is not set: cannot fetch the entity for', event.id);
    return null;
  }

  const base = process.env.STRIKE_API_BASE || 'https://api.strike.me';
  const res = await fetch(`${base}${basePath}/${encodeURIComponent(entityId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Strike API ${res.status} for ${event.eventType} ${entityId}`);
  const entity = await res.json();

  // The fetched entity is the source of truth. Deliveries can repeat and arrive
  // out of order, so don't rebuild state from the sequence of events.
  const changes = event.data?.changes ?? []; // only on *.updated events
  console.log(`${event.eventType} ${entityId} changed [${changes.join(', ')}]`, entity);
  return entity;
}
