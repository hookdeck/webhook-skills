// Generated with: whatnot-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

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

/**
 * Verify a Whatnot delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string} rawBody - the exact body Whatnot sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the wn_wh_ secret from the developer dashboard
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyWhatnotWebhook(rawBody, headers, secret = process.env.WHATNOT_WEBHOOK_SECRET) {
  const key = secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret;
  return new Webhook(key).verify(rawBody, headers); // returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Delivery is at least once, and retries reuse the webhook-id header.
const processedWebhookIds = new Set();

// Money is { amount: "49.77", currency: "USD" }: keep `amount` as a string
// (or a decimal type), never a float.
function formatMoney(money) {
  return money ? `${money.amount} ${money.currency}` : 'n/a';
}

function handleEvent(event) {
  const { type, data = {}, seller_id: sellerId } = event;

  switch (type) {
    // --- Orders (read:orders) ----------------------------------------------
    case 'orders.created':
    case 'orders.updated':
      // No ordering guarantee: orders.updated can arrive before orders.created.
      // Compare data.updated_at with what you stored before overwriting.
      console.log(`${type}: order ${data.id} (${data.status}), total ${formatMoney(data.amounts?.total)}`);
      if (data.cancelled_at) console.log(`Order ${data.id} cancelled at ${data.cancelled_at}`);
      // buyer is null unless your app holds read:customers.
      if (data.buyer) console.log(`Buyer ${data.buyer.username}`);
      break;

    // --- Shows (read:shows) ------------------------------------------------
    case 'shows.created': // excludes rehearsals
    case 'shows.updated': // fires even when only updated_at changed
      console.log(`${type}: show ${data.id} "${data.title}" (${data.status})`);
      break;
    case 'shows.started': // also fires when a stopped show resumes
    case 'shows.ended': // includes Whatnot ending an abandoned show
    case 'shows.cancelled':
      console.log(`${type}: show ${data.show_id}`);
      break;

    // --- Merchandising (read:merchandising) --------------------------------
    case 'merchandising.products.added_to_show':
    case 'merchandising.products.removed_from_show': // also fires when the listing was deleted
      console.log(`${type}: product ${data.product_id} in show ${data.show_id}`);
      break;

    // --- Shipments (read:shipments) ----------------------------------------
    case 'shipments.created':
      // recipient, destination_address and documents need read:customers.
      console.log(`Shipment ${data.id} created (${data.status})`);
      if (data.recipient) console.log(`Recipient ${data.recipient.username}`);
      break;
    case 'shipments.label_generated':
      // documents is null without read:customers and customer-address access.
      console.log(`Shipment ${data.shipment_id} label ${data.reason}: ${data.tracking?.carrier} ${data.tracking?.tracking_code}`);
      if (data.documents?.label_url) console.log(`Label: ${data.documents.label_url}`);
      break;
    case 'shipments.tracking_code_added':
      console.log(`Shipment ${data.shipment_id} tracking: ${data.tracking?.carrier} ${data.tracking?.tracking_code}`);
      break;
    case 'shipments.parcel_updated':
      console.log(`Shipment ${data.shipment_id} parcel updated`);
      break;
    case 'shipments.items.added':
    case 'shipments.items.removed':
      // shipment_item_ids lists every item on the shipment after the change.
      console.log(`${type}: shipment ${data.shipment_id} now has ${data.shipment_item_ids?.length ?? 0} items`);
      break;

    // --- Products (read:inventory) -----------------------------------------
    case 'products.created':
    case 'products.updated': // doesn't say which fields changed
      console.log(`${type}: product ${data.id} "${data.title}"`);
      break;
    case 'products.deleted':
      console.log(`Product ${data.id} deleted`);
      break;

    default:
      // Whatnot adds topics over time: acknowledge, don't fail (an error is retried).
      console.log(`Unhandled Whatnot event type: ${type}`);
  }

  // seller_id is in the signed body; multi-seller apps route on it.
  console.log(`(seller ${sellerId})`);
}

// Whatnot webhook endpoint. express.raw() keeps the exact bytes for the HMAC;
// express.json() would re-serialise Whatnot's space-separated JSON and break it.
app.post('/webhooks/whatnot', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.WHATNOT_WEBHOOK_SECRET) {
    console.error('WHATNOT_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing webhook-id, webhook-timestamp or webhook-signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  let event;
  try {
    event = verifyWhatnotWebhook(rawBody, headers);
  } catch (err) {
    console.error('Whatnot webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse webhook-id; acknowledge duplicates with a 2xx.
  const webhookId = headers['webhook-id'];
  if (processedWebhookIds.has(webhookId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Whatnot times out after 5 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(event);
    processedWebhookIds.add(webhookId);
  } catch (err) {
    console.error('Error handling Whatnot event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // Any 2xx counts as delivered.
  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Whatnot webhook endpoint: POST http://localhost:${PORT}/webhooks/whatnot`);
  });
}

module.exports = { app, verifyWhatnotWebhook, processedWebhookIds };
