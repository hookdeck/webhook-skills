// Generated with: ventrata-webhooks skill
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
 * Ventrata does not sign payloads. You add a secret header in the webhook's headers
 * map when you create it through the OCTO API. The header name is yours, so it comes
 * from VENTRATA_WEBHOOK_HEADER; the expected value is the exact, whole header value
 * (including any "Bearer " prefix). This authenticates the sender, not the body, and
 * gives no replay protection.
 */
function verifyVentrataRequest(
  headers,
  secret = process.env.VENTRATA_WEBHOOK_SECRET,
  headerName = process.env.VENTRATA_WEBHOOK_HEADER || 'X-Webhook-Secret'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

/** The capability lists booking_update; the API examples write booking.updated. */
function normalizeEvent(event) {
  const m = /^(order|booking|availability|product)[._](update|updated)$/.exec(String(event || ''));
  return m ? `${m[1]}_update` : event;
}

function handleEvent(payload) {
  const event = normalizeEvent(payload.event);

  switch (event) {
    case 'order_update':
      console.log(`Order updated: ${payload.order && payload.order.orderId}`);
      // TODO: sync payload.order; payload.diff lists what changed
      break;

    case 'booking_update':
      console.log(`Booking updated: ${payload.booking && payload.booking.uuid}`);
      // TODO: sync payload.booking; payload.diff lists what changed
      break;

    case 'availability_update':
      console.log(`Availability updated: ${payload.availability && payload.availability.id}`);
      // TODO: refresh inventory from payload.availability
      break;

    case 'product_update':
      console.log(`Product updated: ${payload.product && payload.product.id}`);
      // TODO: re-sync payload.product; payload.diff lists what changed
      break;

    default:
      console.log(`Unhandled event: ${payload.event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/ventrata', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyVentrataRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Ventrata event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyVentrataRequest = verifyVentrataRequest;
module.exports.normalizeEvent = normalizeEvent;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ventrata`);
  });
}
