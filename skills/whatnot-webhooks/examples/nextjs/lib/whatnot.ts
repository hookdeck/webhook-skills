// Generated with: whatnot-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

/**
 * WHATNOT WEBHOOK VERIFICATION
 *
 *   header    : X-Whatnot-Webhook-Signature: <lowercase hex HMAC-SHA256>
 *   algorithm : HMAC-SHA256, keyed with your app's webhook secret key
 *               (provided by a Whatnot representative)
 *   signed    : the RAW request body, nothing else (no timestamp, no prefix)
 *   encoding  : hex digest, no "sha256=" prefix
 *
 * Whatnot's own Python sample compares with `==`. This uses a constant-time
 * compare instead, so the check doesn't leak timing information.
 */
const HEX_SHA256 = /^[0-9a-f]{64}$/;

export function verifyWhatnotSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) return false;

  // Hex is case-insensitive; normalise before comparing.
  const received = signature.trim().toLowerCase();
  if (!HEX_SHA256.test(received)) return false; // rejects base64, prefixes, wrong length

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}

/** Money is a string amount + ISO 4217 currency. Never parse amount to a float. */
export interface Money {
  amount: string;
  currency: string;
}

export interface WhatnotEvent<T = Record<string, any>> {
  id: string; // UUID — dedupe on this
  timestamp: string; // ISO 8601 UTC
  topic: string; // e.g. "order/created"
  object: T; // topic-specific payload
}

export interface WhatnotOrder {
  order_id: string;
  product_id: string;
  listing_id: string;
  external_id?: string | null;
  quantity: number;
  subtotal: Money;
  shipping_price: Money;
  taxation: Money;
  customs?: Money | null;
  total: Money;
  items: Array<{
    product_id: string;
    listing_id: string;
    price: Money;
    quantity: number;
    subtotal: Money;
    variant_id?: string | null;
    variant_external_id?: string | null;
  }>;
  product_created_by_client_app_id?: string | null;
  // Only populated for apps with the read_customers scope.
  shipping_address?: {
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  } | null;
  tracking_info?: { tracking_code: string; courier: string; label_url?: string | null } | null;
  cancelled_at?: string | null;
}

// Whatnot retries any non-200 response up to 5 times over ~10 minutes, so the
// same envelope `id` can arrive more than once. Use a database or Redis in
// production.
export const processedEvents = new Set<string>();
