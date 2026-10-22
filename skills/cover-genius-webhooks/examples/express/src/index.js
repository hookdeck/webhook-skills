// Generated with: cover-genius-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the key's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Cover Genius Offers webhooks carry no payload signature. They send your
 * authentication key as plain text in the X-Api-Key header (no prefix).
 */
function verifyCoverGeniusRequest(headers, apiKey = process.env.COVER_GENIUS_API_KEY) {
  if (!apiKey) return false; // never accept when unconfigured
  const received = headers['x-api-key'];
  return typeof received === 'string' && safeEqual(received, apiKey);
}

function handleEvent(body) {
  const { event, payload = {} } = body;

  switch (event) {
    case 'BOOKING_CREATED':
      console.log(`Booking created: ${payload.id} (${payload.total_price_formatted})`);
      // TODO: send the customer confirmation
      break;

    case 'BOOKING_UPDATED':
      console.log(`Booking updated: ${payload.id}`);
      // TODO: sync the updated policy details
      break;

    case 'BOOKING_CANCELLED':
      console.log(`Booking cancelled: ${payload.id}`);
      // TODO: process the refund / cancel fulfilment
      break;

    case 'RENEWAL_CREATED':
      console.log(`Renewal created: ${payload.id} (package ${payload.package_id})`);
      // TODO: record the renewed policy
      break;

    case 'RENEWAL_NOTIFICATION':
      console.log(`Renewal approaching: ${payload.id}, due ${payload.due_date}`);
      // TODO: remind the customer
      break;

    case 'RENEWAL_DUE':
      console.log(`Renewal due: ${payload.id}, grace period ends ${payload.expiry_date}`);
      // TODO: prompt the customer to pay
      break;

    case 'RENEWAL_EXPIRED':
      console.log(`Renewal expired: ${payload.id}`);
      // TODO: mark the policy as lapsed
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/cover-genius', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyCoverGeniusRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing X-Api-Key' });
  }

  let body;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    body = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(body);
  } catch (err) {
    console.error('Error handling Cover Genius event:', err);
    // Anything other than 200 makes Cover Genius retry (up to 3 times).
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCoverGeniusRequest = verifyCoverGeniusRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cover-genius`);
  });
}
