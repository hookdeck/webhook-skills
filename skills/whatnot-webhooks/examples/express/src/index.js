// Generated with: whatnot-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

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

function verifyWhatnotSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;

  // Hex is case-insensitive; normalise before comparing.
  const received = signature.trim().toLowerCase();
  if (!HEX_SHA256.test(received)) return false; // rejects base64, prefixes, wrong length

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}

// --- Idempotency -----------------------------------------------------------
// Whatnot retries any non-200 response up to 5 times over ~10 minutes, so the
// same envelope `id` can arrive more than once. Use a database or Redis in
// production.
const processedEvents = new Set();

// --- Topic handlers --------------------------------------------------------
// The payload for every topic is under `object`. IDs are GraphQL Global IDs.
// Money fields are { amount: "12.34", currency: "USD" }: keep `amount` as a
// string (or a decimal type), never a float.

function formatMoney(money) {
  return money ? `${money.amount} ${money.currency}` : 'n/a';
}

function handleOrder(topic, order) {
  console.log(`${topic}: order ${order.order_id}, total ${formatMoney(order.total)}`);
  if (order.cancelled_at) {
    console.log(`Order ${order.order_id} cancelled at ${order.cancelled_at}`);
  }
  // shipping_address and tracking_info are only populated for apps with the
  // read_customers scope. Otherwise they're null or missing.
  if (order.shipping_address) {
    console.log(`Ship to ${order.shipping_address.city}, ${order.shipping_address.country}`);
  }
  if (order.tracking_info) {
    console.log(`Tracking ${order.tracking_info.courier} ${order.tracking_info.tracking_code}`);
  }
}

function handleEvent(event, sellerId) {
  const obj = event.object || {};

  switch (event.topic) {
    case 'product/sold':
      // Decrement stock in your own system for product_id / variant_id.
      console.log(`Product ${obj.product_id} sold (qty ${obj.quantity}), order ${obj.order_id}`);
      break;
    case 'bulk_operation/finished':
      console.log(`Bulk operation ${obj.id} finished with status ${obj.status}`);
      break;
    case 'listing/created':
    case 'listing/updated':
      console.log(`${event.topic}: listing ${obj.listing_id} (${obj.transaction_type}, ${obj.listing_status})`);
      break;
    case 'order/created':
    case 'order/updated':
      handleOrder(event.topic, obj);
      break;
    case 'livestream/created':
      console.log(`Livestream ${obj.livestream_id} created: ${obj.title}`);
      break;
    case 'livestream/stopped':
      // Fires when a livestream ends OR is cancelled.
      console.log(`Livestream ${obj.livestream_id} stopped`);
      break;
    case 'livestream/product_added':
    case 'livestream/product_removed':
      console.log(`${event.topic}: listing ${obj.listing_id} in livestream ${obj.livestream_id}`);
      break;
    case 'shipment/label_created':
      // BETA topic: Whatnot says it may change without notice.
      // label_url needs the read_customers scope.
      console.log(`Shipment ${obj.shipment_id} label (${obj.reason}): ${obj.courier} ${obj.tracking_code}`);
      break;
    default:
      // Whatnot is in development preview and may add topics. Acknowledge
      // unknown ones with 200: an error would only trigger 5 retries.
      console.log(`Unhandled Whatnot topic: ${event.topic}`);
  }

  if (sellerId) console.log(`(seller ${sellerId})`);
}

// Raw body is required: the HMAC is computed over the exact bytes Whatnot sent.
app.post('/webhooks/whatnot', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.WHATNOT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('WHATNOT_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.get('x-whatnot-webhook-signature');
  if (!signature) {
    return res.status(400).json({ error: 'Missing X-Whatnot-Webhook-Signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyWhatnotSignature(rawBody, signature, secret)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (processedEvents.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  // X-Whatnot-Seller-Id tells a multi-seller app which seller this is for.
  handleEvent(event, req.get('x-whatnot-seller-id'));
  processedEvents.add(event.id);

  // Whatnot expects exactly 200 OK. Anything else is retried.
  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Whatnot webhook endpoint: POST http://localhost:${PORT}/webhooks/whatnot`);
  });
}

module.exports = { app, verifyWhatnotSignature, processedEvents };
