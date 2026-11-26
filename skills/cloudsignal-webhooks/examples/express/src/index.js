// Generated with: cloudsignal-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// CloudSignal (Cloudprinter.com) authenticates each delivery with a plaintext
// per-endpoint "Webhook API key" carried IN the JSON body's `apikey` field.
// There is NO signature header, no HMAC, and no timestamp. This key is distinct
// from your account API key — find it in the Cloudprinter.com Dashboard.
const EXPECTED_APIKEY = process.env.CLOUDSIGNAL_WEBHOOK_APIKEY;
if (!EXPECTED_APIKEY) {
  console.warn(
    'CLOUDSIGNAL_WEBHOOK_APIKEY is not set — every webhook will be rejected with 401. ' +
      'Set it to the Webhook API key from your Cloudprinter.com Dashboard.'
  );
}

// CloudSignal Webhooks v2.1 signal types (case-sensitive, PascalCase): the 11 on the
// v2.1 reference, plus CloudprinterOrderCanceled, which only the official Node SDK lists.
const KNOWN_EVENT_TYPES = [
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
];

const app = express();

/**
 * Timing-safe string comparison that tolerates length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a, b) {
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
 *
 * @param {string|undefined} providedKey - the `apikey` value from the body
 * @param {string|undefined} expectedKey - CLOUDSIGNAL_WEBHOOK_APIKEY
 * @returns {boolean} whether the key is present and matches
 */
function verifyApiKey(providedKey, expectedKey) {
  if (!providedKey || !expectedKey) return false;
  return safeEqual(providedKey, expectedKey);
}

// There is no body signature to protect, so ordinary JSON parsing is fine here —
// in fact the `apikey` we authenticate against lives INSIDE the parsed JSON.
app.post('/webhooks/cloudsignal', express.json(), (req, res) => {
  const signal = req.body || {};

  // Authenticate: the per-endpoint Webhook API key is carried in the body.
  if (!verifyApiKey(signal.apikey, EXPECTED_APIKEY)) {
    console.error('CloudSignal webhook authentication failed: apikey mismatch');
    return res.status(401).send('Unauthorized');
  }

  const { type, order, item, order_reference, item_reference } = signal;
  console.log(
    `Received CloudSignal ${type} (order ${order}, order_reference ${order_reference})`
  );

  // Dispatch on the signal `type`.
  switch (type) {
    case 'CloudprinterOrderValidated':
      // Order received and validated by Cloudprinter.
      console.log('Order validated:', order, order_reference);
      break;

    case 'ItemValidated':
      // An item was received/validated by production.
      console.log('Item validated:', item, item_reference);
      break;

    case 'ItemProduce':
      // Production of the item has started.
      console.log('Item production started:', item, item_reference);
      break;

    case 'ItemProduced':
      // Production of the item has completed.
      console.log('Item produced:', item, item_reference);
      break;

    case 'ItemPacked':
      // The item has been packed, ready for shipping.
      console.log('Item packed:', item, item_reference);
      break;

    case 'ItemShipped':
      // The item has shipped. Type-specific fields: tracking, shipping_option, url.
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
      // A production issue occurred. Type-specific fields: cause, delay (both optional).
      console.log('Item error:', item, 'cause:', signal.cause);
      // Your code: Alert your team, reprint, or refund.
      break;

    case 'ItemCanceled':
      // The item was canceled in production. Type-specific fields: cause, message (optional).
      console.log('Item canceled:', item, 'cause:', signal.cause);
      break;

    case 'CloudprinterOrderCanceled':
      // The whole order was canceled. Listed only in the official Node SDK.
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

  // Respond 200 (or 204) quickly. Any other status makes CloudSignal retry the
  // signal — up to 100 attempts over 7 days.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = { app, verifyApiKey, KNOWN_EVENT_TYPES };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cloudsignal`);
  });
}
