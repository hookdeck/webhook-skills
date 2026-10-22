// Generated with: project44-webhooks skill
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
 * project44 does not sign payloads. With the API_KEY authentication method it adds a
 * header you named (api_key_name) with the value you chose. The header name is user-chosen,
 * so it comes from PROJECT44_WEBHOOK_HEADER; the expected value is the exact, whole header
 * value from PROJECT44_WEBHOOK_SECRET (no "Bearer " parsing).
 */
function verifyProject44Request(headers, env = process.env) {
  const secret = env.PROJECT44_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const name = (env.PROJECT44_WEBHOOK_HEADER || 'X-Api-Key').toLowerCase();
  const received = headers[name]; // Node lowercases incoming header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { eventType, eventId } = payload;
  const shipmentId = payload.context && payload.context.shipment && payload.context.shipment.shipmentId;

  // project44 can redeliver after a lost response: dedupe on eventId in real code.
  switch (eventType) {
    case 'shipments.v1.shipment.created':
      console.log(`Shipment created: ${shipmentId} (${eventId})`);
      // TODO: register the shipment in your system
      break;

    case 'shipments.v1.shipment.deleted':
      console.log(`Shipment deleted: ${shipmentId} (${eventId})`);
      // TODO: stop tracking the shipment
      break;

    case 'shipments.v1.event.added':
      console.log(`Shipment event added: ${shipmentId} (${eventId})`);
      // TODO: record the new milestone from payload.data
      break;

    case 'shipments.v1.event.updated':
      console.log(`Shipment event updated: ${shipmentId} (${eventId})`);
      // TODO: update the milestone from payload.data
      break;

    case 'shipments.v1.event.removed':
      console.log(`Shipment event removed: ${shipmentId} (${eventId})`);
      // TODO: remove the milestone
      break;

    case 'shipments.v1.state.added':
      console.log(`Shipment state added: ${shipmentId} (${eventId})`);
      // TODO: record the new state from payload.data
      break;

    case 'shipments.v1.state.updated':
      console.log(`Shipment state updated: ${shipmentId} (${eventId})`);
      // TODO: update the state from payload.data
      break;

    case 'shipments.v1.state.removed':
      console.log(`Shipment state removed: ${shipmentId} (${eventId})`);
      // TODO: remove the state
      break;

    case 'shipments.v1.exception.addedOrUpdated':
      console.log(`Shipment exception added or updated: ${shipmentId} (${eventId})`);
      // TODO: alert on the exception in payload.data
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// The webhook method is configurable in project44 (POST by default), so accept all four.
const METHODS = ['GET', 'POST', 'PUT', 'PATCH'];

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/project44', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.includes(req.method)) {
    res.set('Allow', METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyProject44Request(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing API key header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  // An empty body (e.g. GET) is acknowledged without handling.
  if (raw.trim() === '') {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
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
    console.error('Error handling project44 event:', err);
    // project44 does not retry 500 but does retry 503, so signal a transient failure.
    return res.status(503).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyProject44Request = verifyProject44Request;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/project44`);
  });
}
