// Generated with: vtex-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * VTEX does not sign hooks. It sends the entries of the hook configuration's
 * "headers" object with every notification, so we check a secret header we added.
 * The header name is user-chosen; the whole value is compared (no Bearer parsing).
 */
function verifyVtexRequest(
  headers,
  name = process.env.VTEX_WEBHOOK_HEADER || 'X-Webhook-Secret',
  secret = process.env.VTEX_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lower-cases header names
  return Boolean(received) && safeEqual(received, secret);
}

// VTEX POSTs {"hookConfig": "ping"} when the hook is saved and needs a 200.
function isPing(payload) {
  return Boolean(payload) && typeof payload === 'object' && payload.hookConfig === 'ping';
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function handleEvent(payload) {
  const { OrderId, State } = payload;

  switch (State) {
    case 'order-created':
      console.log(`Order created: ${OrderId}`);
      // TODO: create the order in your ERP
      break;

    case 'on-order-completed':
      console.log(`Order completed: ${OrderId}`);
      // TODO: confirm the order downstream
      break;

    case 'payment-pending':
      console.log(`Payment pending: ${OrderId}`);
      // TODO: hold fulfillment
      break;

    case 'payment-approved':
      console.log(`Payment approved: ${OrderId}`);
      // TODO: release the order for fulfillment
      break;

    case 'waiting-ffmt-authorization':
      console.log(`Waiting for fulfillment authorization: ${OrderId}`);
      // TODO: approve or reject fulfillment
      break;

    case 'ready-for-handling':
      console.log(`Ready for handling: ${OrderId}`);
      // TODO: create a pick/pack task
      break;

    case 'start-handling':
      console.log(`Start handling: ${OrderId}`);
      // TODO: reserve stock
      break;

    case 'handling':
      console.log(`Handling: ${OrderId}`);
      // TODO: update tracking status
      break;

    case 'invoiced':
      console.log(`Invoiced: ${OrderId}`);
      // TODO: send the invoice, trigger shipping
      break;

    case 'cancel':
      console.log(`Cancel: ${OrderId}`);
      // TODO: stop fulfillment
      break;

    case 'canceled':
      console.log(`Canceled: ${OrderId}`);
      // TODO: restock and refund
      break;

    default:
      console.log(`Unhandled state: ${State}`);
  }
}

// Read the body raw (any content type) so the credential is checked before parsing.
app.post('/webhooks/vtex', express.raw({ type: '*/*' }), (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  // Setup ping: answer 200 before the auth check (the docs don't say if it carries headers).
  if (isPing(parseJson(raw))) {
    return res.status(200).json({ received: true });
  }

  if (!verifyVtexRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  const payload = parseJson(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling VTEX event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyVtexRequest = verifyVtexRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/vtex`);
  });
}
