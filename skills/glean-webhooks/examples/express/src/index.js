// Generated with: glean-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Optional extra check: Authorization: Bearer <secret> when the trigger was
// created with delivery.auth type BEARER. It never replaces the signature.
function bearerOk(req) {
  const expected = process.env.GLEAN_DELIVERY_BEARER;
  if (!expected) return true;
  const a = Buffer.from(req.headers.authorization || '');
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// IMPORTANT: express.raw({ type: '*/*' }) keeps the exact raw bytes for any content type.
app.post('/webhooks/glean', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.GLEAN_SIGNING_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const id = req.headers['webhook-id'];
  const timestamp = req.headers['webhook-timestamp'];
  const signature = req.headers['webhook-signature'];
  if (!id || !timestamp || !signature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing request body' });
  }

  if (!bearerOk(req)) {
    return res.status(401).json({ error: 'Invalid delivery credential' });
  }

  try {
    // The library enforces a fixed 5-minute timestamp window. Retries/replays
    // keep the original timestamp, so late ones are rejected here. See
    // references/verification.md for a manual verifier with a configurable window.
    new Webhook(secret).verify(req.body, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Webhook verification failed:', err.message || err);
    const detail = /timestamp/i.test(err.message || '')
      ? 'Timestamp too old'
      : 'Invalid signature';
    return res.status(400).json({ error: detail });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Presets are per deployment: dispatch on the payload's event_type.
  console.log(`Received Glean trigger ${event.trigger_id} (${event.event_type}) webhook-id=${id}`);

  switch (event.event_type) {
    case 'CONTENT_SCHEDULE':
      console.log('Scheduled event:', {
        title: event.title,
        event_time: event.event_time,
        view_url: event.view_url,
      });
      break;
    default:
      console.log('Unhandled event type:', event.event_type, event.reason);
  }

  res.status(200).json({ success: true, event_type: event.event_type });
});

const server = app.listen(PORT, () => {
  console.log(`Glean webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/glean`);
});

module.exports = { app, server };
