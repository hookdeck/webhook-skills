// Generated with: deliverect-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const SIGNATURE_HEADER = 'x-server-authorization-hmac-sha256';
const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

/**
 * Deliverect sends a bare hex HMAC-SHA256 of the raw body in x-server-authorization-hmac-sha256.
 * Nothing else is signed (no timestamp), and a GET with no body is signed over the empty string.
 * The secret is used as UTF-8 bytes: the call's channelLink / locationId before certification,
 * the Integration-settings HMAC secret after.
 */
function verifyDeliverectSignature(rawBody, signature, secret = process.env.DELIVERECT_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  if (!HEX_DIGEST.test(signature)) return false; // validate before decoding
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Deliverect has no event field: the kind of call is chosen by the URL you registered.
// Kind names and body fields below are illustrative; check your integration's payloads.
function handleDeliverectCall(kind, payload) {
  switch (kind) {
    case 'order_status_update': {
      const orderId = typeof payload.orderId === 'string' ? payload.orderId : 'unknown';
      const status = typeof payload.status === 'string' || typeof payload.status === 'number'
        ? payload.status
        : 'unknown';
      console.log(`Order ${orderId} status: ${status}`);
      // TODO: update the order in your system
      break;
    }

    case 'menu_update': {
      const menus = Array.isArray(payload.menus) ? payload.menus : [];
      console.log(`Menu update with ${menus.length} menu(s)`);
      // TODO: sync the menu
      break;
    }

    case 'snooze_unsnooze': {
      const operations = Array.isArray(payload.operations) ? payload.operations : [];
      for (const op of operations) {
        if (!isObject(op)) continue;
        const action = typeof op.action === 'string' ? op.action : 'unknown';
        const items = isObject(op.data) && Array.isArray(op.data.items) ? op.data.items : [];
        console.log(`Snooze operation "${action}" for ${items.length} item(s)`);
        // TODO: update item availability
      }
      break;
    }

    case 'busy_mode': {
      const status = typeof payload.status === 'string' ? payload.status : 'unknown';
      console.log(`Busy mode: ${status}`);
      // TODO: pause or resume accepting orders
      break;
    }

    default:
      console.log(`Unhandled Deliverect call: ${kind || '(no kind)'}`);
  }
}

// Optional path segment picks the kind: /webhooks/deliverect/order-status-update, etc.
function kindFromRequest(req) {
  const segment = typeof req.params.kind === 'string' ? req.params.kind : '';
  return segment.toLowerCase().replace(/-/g, '_');
}

// Deliverect sends mostly POSTs, but some signed calls are GETs with no body, so every method
// is accepted. The body is read raw (any content type) and verified before it is parsed.
async function deliverectHandler(req, res) {
  // express.raw leaves req.body undefined when the request has no body (e.g. GET).
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyDeliverectSignature(rawBody, req.headers[SIGNATURE_HEADER])) {
    return res.status(401).json({ error: 'Invalid or missing Deliverect signature' });
  }

  // A verified call with no body (such as a GET) is simply acknowledged.
  if (rawBody.length === 0 || rawBody.toString('utf8').trim() === '') {
    console.log(`Deliverect ${req.method} request with an empty body`);
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!isObject(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleDeliverectCall(kindFromRequest(req), payload);
  } catch (err) {
    console.error('Error handling Deliverect webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  app[method](['/webhooks/deliverect', '/webhooks/deliverect/:kind'], express.raw({ type: '*/*' }), deliverectHandler);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyDeliverectSignature = verifyDeliverectSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/deliverect[/<kind>] (GET, POST, PUT, PATCH, DELETE)`);
  });
}
