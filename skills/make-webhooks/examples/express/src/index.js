// Generated with: make-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// The HTTP module's method is user-chosen, so accept all the usual ones.
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

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
 * Make's HTTP module does not sign requests. With an API key keychain (placement
 * "In the header") it sends <parameter name>: <Key>, exactly as entered. Compare
 * the WHOLE header value: don't strip a "Bearer " prefix, it is part of the Key.
 *
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection (no signature, no timestamp).
 */
function verifyMakeRequest(headers, config = process.env) {
  const expected = config.MAKE_WEBHOOK_SECRET;
  if (!expected) return false; // never accept when unconfigured

  const headerName = (config.MAKE_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[headerName];
  return typeof received === 'string' && safeEqual(received, expected);
}

/**
 * Make has no built-in event types: the payload is whatever your scenario maps.
 * These examples assume { "event": "...", "id": "...", "data": {...} }.
 */
function handleEvent(payload) {
  const { event, id, data = {} } = payload;

  switch (event) {
    case 'order.created':
      console.log(`Order created: ${data.order_id}`);
      // TODO: fulfil the order
      break;

    case 'lead.created':
      console.log(`Lead created: ${data.email}`);
      // TODO: add the lead to your CRM
      break;

    case 'scenario.completed':
      console.log(`Scenario completed: ${data.scenario_name}`);
      // TODO: mark the job as done
      break;

    case 'scenario.failed':
      console.log(`Scenario failed: ${data.scenario_name} (${data.error})`);
      // TODO: alert the owning team
      break;

    default:
      console.log(`Unhandled event: ${event} (id: ${id})`);
  }
}

// Read the body raw (any content type) so the request is authenticated before
// anything is parsed. GET requests arrive with no body.
app.all('/webhooks/make', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.includes(req.method)) {
    res.set('Allow', METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyMakeRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credentials' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  // An empty body (e.g. GET) is valid: there is simply no event to dispatch.
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
    console.error('Error handling Make event:', err);
    // A non-2xx makes the HTTP module error, which stops the scenario run
    // unless an error handler route is attached.
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyMakeRequest = verifyMakeRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/make`);
  });
}
