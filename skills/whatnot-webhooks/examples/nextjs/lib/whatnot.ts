// Generated with: whatnot-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Whatnot signs webhooks with Standard Webhooks:
//   webhook-id         UUID, unique per event and reused on retries (dedupe key)
//   webhook-timestamp  Unix seconds when this attempt was sent (5-minute tolerance)
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the dashboard secret after its `wn_wh_` prefix.
// The library strips only its own `whsec_` prefix, so strip `wn_wh_` first.
// ---------------------------------------------------------------------------

const SECRET_PREFIX = 'wn_wh_';

export type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/** Money is a string amount + ISO 4217 currency. Never parse amount to a float. */
export interface Money {
  amount: string;
  currency: string;
}

export interface UserSummary {
  id: string;
  username: string;
  display_name: string | null;
}

export interface WhatnotEvent<T = Record<string, any>> {
  type: string; // e.g. "orders.created" — route on this
  timestamp: string; // ISO 8601 UTC, stable across retries
  data: T; // topic-specific payload
  version: string; // "v2"
  seller_id: string; // signed, so multi-seller apps can route on it
}

export interface WhatnotOrder {
  id: string;
  status: 'pending' | 'pending_fulfillment' | 'completed' | 'cancelled' | 'failed';
  show_id: string | null;
  transaction_type: 'buy_it_now' | 'auction' | 'giveaway' | 'other' | null;
  buyer: UserSummary | null; // null without read:customers
  amounts: {
    subtotal: Money;
    shipping: Money;
    tax: Money;
    applied_discount: { type: string; amount: Money } | null;
    total: Money;
  };
  created_at: string | null;
  updated_at: string | null;
  cancelled_at: string | null;
}

/**
 * Verify a Whatnot delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry. Throws on failure.
 */
export function verifyWhatnotWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.WHATNOT_WEBHOOK_SECRET as string
): WhatnotEvent {
  const key = secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret;
  return new Webhook(key).verify(rawBody, headers) as WhatnotEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Delivery is at least once, and retries reuse the webhook-id header.
export const processedWebhookIds = new Set<string>();
