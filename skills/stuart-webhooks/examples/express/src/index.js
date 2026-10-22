// Generated with: stuart-webhooks skill
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
 * Stuart does not sign payloads. You choose a "Webhook authentication header" (name starts
 * with X-) and key; Stuart adds that header to every webhook. The value is compared whole:
 * no 'Bearer ' parsing. A static credential authenticates the sender, not the body, and gives
 * no replay protection: use HTTPS and rotate it if it leaks.
 */
function verifyStuartRequest(
  headers,
  name = process.env.STUART_WEBHOOK_HEADER || 'X-Webhook-Secret',
  secret = process.env.STUART_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { topic, details = {} } = payload;
  const pkg = details.package || {};
  const ref = `${pkg.id} (${pkg.reference})`;

  switch (topic) {
    case 'package_created':
      console.log(`Package created: ${ref}`);
      // TODO: store pkg.id next to your order
      break;

    case 'courier_assigned':
      console.log(`Courier assigned to ${ref}: ${details.courier && details.courier.name}`);
      // TODO: show the courier name and tracking URLs
      break;

    case 'courier_arriving':
      console.log(`Courier arriving at ${details.task} for ${ref}`);
      // TODO: tell the store (pickup) or customer (dropoff)
      break;

    case 'package_split':
      console.log(`Package ${ref} split into ${details.new_package && details.new_package.id}`);
      // TODO: track the new package
      break;

    case 'courier_waiting':
      console.log(`Courier waiting at ${details.task} for ${ref}`);
      // TODO: nudge the store or customer
      break;

    case 'package_delivering':
      console.log(`Package delivering: ${ref}`);
      // TODO: mark the order out for delivery
      break;

    case 'package_delivered':
      console.log(`Package delivered: ${ref}`);
      // TODO: close the order
      break;

    case 'package_canceled':
      console.log(`Package canceled: ${ref} (${details.cancelation && details.cancelation.key})`);
      // TODO: refund or reship
      break;

    case 'package_returning':
      console.log(`Package returning: ${ref} (${details.return && details.return.key})`);
      // TODO: flag the failed delivery
      break;

    case 'package_returned':
      console.log(`Package returned: ${ref}`);
      // TODO: restock
      break;

    case 'courier_reassigning':
      console.log(`Courier reassigning: ${ref} (${details.reassigning && details.reassigning.key})`);
      // TODO: reset the ETA
      break;

    case 'courier_moving':
      console.log(`Courier moving for ${ref}`);
      // TODO: update the live map from details.coordinates
      break;

    default:
      console.log(`Unhandled topic: ${topic}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/stuart', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyStuartRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing authentication header' });
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
    // TODO: deduplicate on payload.event_id (unique except on retries)
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Stuart event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyStuartRequest = verifyStuartRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/stuart`);
  });
}
