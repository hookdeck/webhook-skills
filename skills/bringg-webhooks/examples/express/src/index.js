// Generated with: bringg-webhooks skill
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
 * Bringg does not sign webhooks. Authenticate with the Static Header you added to the
 * webhook: the header name is yours (BRINGG_WEBHOOK_HEADER, default Authorization) and the
 * expected value (BRINGG_WEBHOOK_SECRET) is compared whole, including any "Bearer " prefix.
 * Node lowercases incoming header names, so the lookup is case-insensitive.
 */
function verifyBringgRequest(headers, config = process.env) {
  const secret = config.BRINGG_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured

  const headerName = (config.BRINGG_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[headerName];
  if (typeof received !== 'string' || received === '') return false;

  return safeEqual(received, secret);
}

/**
 * Every Bringg webhook body carries a webhook_type. Order (task) webhooks include the
 * order object; the exact fields depend on the webhook and any Flexible Webhook setup.
 */
function handleEvent(payload) {
  const { webhook_type: type } = payload;

  switch (type) {
    case 'task_created':
      console.log(`Order created: ${payload.id} (${payload.title})`);
      // TODO: create the order in your OMS
      break;

    case 'task_done':
      console.log(`Order done: ${payload.id}`);
      // TODO: mark the order as delivered
      break;

    case 'task_cancelled':
      console.log(`Order cancelled: ${payload.id}`);
      // TODO: cancel the order downstream
      break;

    case 'driver_assigned':
      console.log(`Order assigned to driver: ${payload.id}`);
      // TODO: notify the customer
      break;

    case 'way_point_arrived':
      console.log('Driver arrived at destination');
      // TODO: send an "arrived" notification
      break;

    case 'note_created':
      console.log('Order attachment created');
      // TODO: store the note, photo or signature
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before anything is parsed.
app.post('/webhooks/bringg', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyBringgRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credentials' });
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
    console.error('Error handling Bringg event:', err);
    // Bringg tries each webhook three times; unconfirmed ones land in its undelivered report.
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyBringgRequest = verifyBringgRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bringg`);
  });
}
