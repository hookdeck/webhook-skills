// Generated with: katana-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Katana's docs don't name the HTTP method, so accept all five.
const METHODS = new Set(['POST', 'PUT', 'PATCH', 'GET', 'DELETE']);

/**
 * Verify Katana's x-sha2-signature: lowercase hex HMAC-SHA256 of the raw body bytes,
 * keyed with the webhook's token as UTF-8 (never hex-decoded). Nothing else is signed.
 */
function verifyKatanaSignature(rawBody, signature, secret = process.env.KATANA_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  // Safe to decode: the format was validated above (exactly 64 hex characters).
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Dispatch on the top-level `action` field. `object` only holds id, status and href.
function handleEvent(payload) {
  const { action, object } = payload;

  switch (action) {
    case 'sales_order.created':
      console.log(`Sales order created: ${object && object.id}`);
      // TODO: fetch the order from object.href and sync it
      break;

    case 'sales_order.delivered':
      console.log(`Sales order delivered: ${object && object.id}`);
      // TODO: send a shipping confirmation
      break;

    case 'purchase_order.received':
      console.log(`Purchase order received: ${object && object.id}`);
      // TODO: update inbound stock
      break;

    case 'manufacturing_order.done':
      console.log(`Manufacturing order done: ${object && object.id}`);
      // TODO: update finished-goods inventory
      break;

    case 'inventory.product_out_of_stock':
      console.log(`Product out of stock: ${object && object.id}`);
      // TODO: trigger a reorder
      break;

    default:
      console.log(`Unhandled event: ${action}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before parsing.
app.all('/webhooks/katana', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.has(req.method)) {
    res.set('Allow', [...METHODS].join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // A request with no body (e.g. GET) is verified over zero bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyKatanaSignature(rawBody, req.headers['x-sha2-signature'])) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  // A verified request with no body (e.g. a GET) carries no event: acknowledge it.
  if (rawBody.length === 0) return res.status(200).json({ received: true });

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Katana webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyKatanaSignature = verifyKatanaSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/katana`);
  });
}
