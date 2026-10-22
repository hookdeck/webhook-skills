require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();

// Verify the request and return the parsed JSON body.
// PostHog signs `${webhook-id}.${webhook-timestamp}.${raw body}` with HMAC-SHA256
// (Standard Webhooks). The library enforces a fixed 5-minute timestamp window.
function verifyPostHog(rawBody, headers, secret) {
  const wh = new Webhook(secret); // strips optional whsec_, base64-decodes
  return wh.verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  });
}

// CRITICAL: raw body for verification. type '*/*' so any content type verifies.
app.post('/webhooks/posthog', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.POSTHOG_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'POSTHOG_WEBHOOK_SECRET is not set' });
  }

  if (!req.headers['webhook-id'] || !req.headers['webhook-timestamp'] || !req.headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing webhook-id, webhook-timestamp or webhook-signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  let payload;
  try {
    payload = verifyPostHog(rawBody, req.headers, secret);
  } catch (err) {
    console.error('PostHog signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // The body is whatever the destination template sends. The default is
  // { event: { event, uuid, distinct_id, properties, timestamp, ... }, person: {...} }
  const event = payload && payload.event;
  const name = event && event.event;

  switch (name) {
    case '$pageview':
      console.log('Pageview:', event.distinct_id, event.properties && event.properties.$current_url);
      break;
    case '$identify':
      console.log('Identify:', event.distinct_id);
      break;
    case '$autocapture':
      console.log('Autocapture:', event.distinct_id);
      break;
    default:
      // Custom events arrive under their own names, e.g. "signed_up"
      console.log('Event:', name);
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`PostHog webhook server listening on http://localhost:${port}`));
}

module.exports = app;
