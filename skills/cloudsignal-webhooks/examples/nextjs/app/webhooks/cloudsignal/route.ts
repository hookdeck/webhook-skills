// Generated with: cloudsignal-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// CloudSignal Webhooks v2.1 signal types (case-sensitive, PascalCase): the 11 on the
// v2.1 reference, plus CloudprinterOrderCanceled, which only the official Node SDK lists.
export const KNOWN_EVENT_TYPES = [
  'CloudprinterOrderValidated',
  'ItemValidated',
  'ItemProduce',
  'ItemProduced',
  'ItemPacked',
  'ItemShipped',
  'ItemError',
  'ItemCanceled',
  'CloudprinterOrderCanceled',
  'ItemDeliveryStarted',
  'ItemDeliveryCompleted',
  'ItemDeliveryFailed',
] as const;

/**
 * Timing-safe string comparison that tolerates length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify a CloudSignal webhook.
 *
 * CloudSignal has NO signature header/HMAC. Authenticity is established by the
 * plaintext `apikey` field in the JSON body matching the per-endpoint Webhook
 * API key you configured. Compare it with a timing-safe comparison.
 */
export function verifyApiKey(
  providedKey: string | undefined,
  expectedKey: string | undefined
): boolean {
  if (!providedKey || !expectedKey) return false;
  return safeEqual(providedKey, expectedKey);
}

export async function POST(request: NextRequest) {
  const expectedKey = process.env.CLOUDSIGNAL_WEBHOOK_APIKEY;

  // No body signature to protect, so ordinary JSON parsing is safe here — in
  // fact the `apikey` we authenticate against lives INSIDE the parsed JSON.
  const signal = await request.json();

  // Authenticate: the per-endpoint Webhook API key is carried in the body.
  if (!verifyApiKey(signal.apikey, expectedKey)) {
    console.error('CloudSignal webhook authentication failed: apikey mismatch');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { type, order, item, order_reference, item_reference } = signal;
  console.log(
    `Received CloudSignal ${type} (order ${order}, order_reference ${order_reference})`
  );

  // Dispatch on the signal `type`.
  switch (type) {
    case 'CloudprinterOrderValidated':
      console.log('Order validated:', order, order_reference);
      break;

    case 'ItemValidated':
      console.log('Item validated:', item, item_reference);
      break;

    case 'ItemProduce':
      console.log('Item production started:', item, item_reference);
      break;

    case 'ItemProduced':
      console.log('Item produced:', item, item_reference);
      break;

    case 'ItemPacked':
      console.log('Item packed:', item, item_reference);
      break;

    case 'ItemShipped':
      // Type-specific fields: tracking, shipping_option, url.
      console.log(
        'Item shipped:',
        item,
        'tracking:',
        signal.tracking,
        'shipping_option:',
        signal.shipping_option
      );
      // Your code: Store the tracking number, notify the customer.
      break;

    case 'ItemError':
      // Type-specific fields: cause, delay (both optional).
      console.log('Item error:', item, 'cause:', signal.cause);
      // Your code: Alert your team, reprint, or refund.
      break;

    case 'ItemCanceled':
      // Type-specific fields: cause, message (both optional).
      console.log('Item canceled:', item, 'cause:', signal.cause);
      break;

    case 'CloudprinterOrderCanceled':
      console.log('Order canceled:', order, order_reference);
      break;

    case 'ItemDeliveryStarted':
    case 'ItemDeliveryCompleted':
    case 'ItemDeliveryFailed':
      // v2.1 delivery signals. Type-specific fields: tracking, message (both optional).
      console.log('Delivery update:', type, item, 'tracking:', signal.tracking, signal.message);
      break;

    default:
      // Unknown/new type: acknowledge with 200 so CloudSignal does not retry.
      console.log(`Unhandled CloudSignal type: ${type}`);
  }

  // Respond 200 quickly. Anything other than 200 or 204 makes CloudSignal retry
  // (up to 100 attempts over 7 days).
  return NextResponse.json({ received: true });
}
