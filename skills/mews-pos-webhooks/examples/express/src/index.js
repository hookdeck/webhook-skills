// Generated with: mews-pos-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Standard Base64 (padded) of a 32-byte digest: 43 characters plus "=".
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Mews POS signs the raw body with HMAC-SHA256 (key = secret as UTF-8 bytes) and sends the
 * bare padded Base64 digest in X-Signature. Nothing else is signed, so there is no timestamp
 * to check. The format is validated first so Buffer.from never decodes untrusted input, and
 * the Base64 string is compared exactly (a non-canonical encoding of the same bytes fails).
 */
function verifyMewsPosSignature(rawBody, signature, secret = process.env.MEWS_POS_WEBHOOK_SECRET) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  if (typeof signature !== 'string' || !SIGNATURE_FORMAT.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); // both 44 bytes
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function handleEvent(eventType, data) {
  const id = typeof data.id === 'string' ? data.id : undefined;
  const attributes = isObject(data.attributes) ? data.attributes : {};

  switch (eventType) {
    case 'booking.status.updated':
      console.log(`Booking ${id} status: ${attributes.status}`);
      // TODO: update table or guest state
      break;

    case 'order.state.updated':
      console.log(`Order ${id} state updated`);
      // TODO: sync the order lifecycle
      break;

    case 'order.status.updated':
      console.log(`Order ${id} status updated`);
      // TODO: refresh kitchen and front-of-house displays
      break;

    case 'order.total.updated':
      console.log(`Order ${id} total updated`);
      // TODO: reconcile totals
      break;

    case 'order.payments.added':
      console.log(`Payment added to order ${id}`);
      // TODO: record the payment for accounting
      break;

    case 'product.availability.updated':
      console.log(`Product ${id} availability updated`);
      // TODO: sync menu and stock
      break;

    default:
      console.log(`Unhandled Mews POS event: ${eventType}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before parsing.
app.post('/webhooks/mews-pos', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyMewsPosSignature(rawBody, req.headers['x-signature'])) {
    return res.status(401).json({ error: 'Invalid or missing X-Signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // The body is untrusted: check each level before reading into it.
  if (!isObject(event) || !isObject(event.meta) || typeof event.meta.eventType !== 'string') {
    return res.status(400).json({ error: 'Expected { data, meta: { eventType } }' });
  }
  const data = isObject(event.data) ? event.data : {};

  try {
    handleEvent(event.meta.eventType, data);
  } catch (err) {
    console.error('Error handling Mews POS webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyMewsPosSignature = verifyMewsPosSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mews-pos`);
  });
}
