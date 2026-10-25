// Generated with: cin7-core-webhooks skill
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
 * Cin7 Core does not sign payloads. It sends the header configured on the webhook
 * (bearerauth -> Authorization, or a custom ExternalHeaders key). Compare the WHOLE
 * value exactly; do not strip or parse a 'Bearer ' prefix.
 */
function verifyCin7CoreRequest(headers, {
  name = process.env.CIN7_CORE_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.CIN7_CORE_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { EventType } = payload;

  switch (EventType) {
    case 'Sale/Created':
      console.log('Sale created');
      // TODO: sync the new sale to your system
      break;

    case 'Sale/OrderAuthorised':
      console.log('Sale order authorised');
      // TODO: start fulfilment
      break;

    case 'Sale/ShipmentAuthorised':
      console.log('Sale shipment authorised');
      // TODO: notify the customer / update tracking
      break;

    case 'Purchase/OrderAuthorised':
      console.log('Purchase order authorised');
      // TODO: sync the purchase to accounting
      break;

    case 'Product/Updated':
      console.log('Product updated');
      // TODO: refresh your catalogue
      break;

    default:
      console.log(`Unhandled event: ${EventType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/cin7-core', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyCin7CoreRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
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
    console.error('Error handling Cin7 Core event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCin7CoreRequest = verifyCin7CoreRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cin7-core`);
  });
}
