// Generated with: rapidapi-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison of two strings. Lengths are checked first so
 * timingSafeEqual never throws on unequal-length buffers.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * RapidAPI Enterprise Hub does not sign payloads. Every event request carries the hub's
 * webhook secret key as plain text in the x-rapidapi-webhook-secret header. Compare the
 * WHOLE header value with the key you configured.
 */
function verifyRapidApiRequest(headers, secret = process.env.RAPIDAPI_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers['x-rapidapi-webhook-secret'];
  return Boolean(received) && safeEqual(received, secret);
}

// The body format isn't documented. Name the JSON field that holds the event type
// (for example after sending a "Test event" from the Admin Panel) in RAPIDAPI_EVENT_FIELD.
function getEventName(payload) {
  const field = process.env.RAPIDAPI_EVENT_FIELD;
  const value = field ? payload[field] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function handleEvent(payload) {
  const event = getEventName(payload);

  switch (event) {
    case 'API Created':
      console.log('API created');
      // TODO: sync the new API to your catalog or gateway
      break;

    case 'API Updated':
      console.log('API updated');
      // TODO: refresh the API in your gateway
      break;

    case 'API Deleted':
      console.log('API deleted');
      // TODO: remove the API from your gateway
      break;

    case 'Subscription Created':
      console.log('Subscription created');
      // TODO: sync the new subscription to your CRM or billing system
      break;

    case 'Subscription Updated':
      console.log('Subscription updated');
      // TODO: update the subscription downstream
      break;

    case 'User Created':
      console.log('User created');
      // TODO: provision the user in your systems
      break;

    case 'Billing Plan Updated':
      console.log('Billing plan updated');
      // TODO: update plan pricing downstream
      break;

    default:
      console.log(`Unhandled event: ${event ?? 'unknown (set RAPIDAPI_EVENT_FIELD)'}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/rapidapi', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyRapidApiRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing x-rapidapi-webhook-secret' });
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
    console.error('Error handling RapidAPI event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRapidApiRequest = verifyRapidApiRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/rapidapi`);
  });
}
