require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Verify a Spike API webhook signature.
 *
 * X-Body-Signature is the bare hex HMAC-SHA256 of the raw request body, keyed
 * with the shared secret from the admin console (UTF-8 bytes, used as-is).
 * No timestamp is signed.
 */
function verifySpikeSignature(rawBody, signature, secret) {
  // Validate shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}

// Raw body for any content type so we verify the exact bytes Spike API sent
app.use('/webhooks/spike-api', express.raw({ type: '*/*' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhooks/spike-api', (req, res) => {
  const signature = req.headers['x-body-signature'];
  const secret = process.env.SPIKE_API_WEBHOOK_SECRET;

  if (!secret) {
    return res.status(500).json({ error: 'SPIKE_API_WEBHOOK_SECRET not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!signature || !verifySpikeSignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let events;
  try {
    events = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The body is a JSON ARRAY; one delivery can batch several events
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'Expected a JSON array of events' });
  }

  for (const event of events) {
    // Everything after verification is still untrusted input: check types
    if (event === null || typeof event !== 'object' || Array.isArray(event)) continue;
    const eventType = typeof event.event_type === 'string' ? event.event_type : undefined;
    const user = typeof event.application_user_id === 'string' ? event.application_user_id : 'unknown';
    const provider = typeof event.provider_slug === 'string' ? event.provider_slug : 'unknown';

    switch (eventType) {
      case 'record_change': {
        const metrics = Array.isArray(event.metrics) ? event.metrics.filter((m) => typeof m === 'string') : [];
        console.log(`New data from ${provider} for ${user}: ${metrics.join(', ') || 'no metrics'}`);
        // Fetch the changed records from the Spike API between
        // earliest_record_start_at and latest_record_end_at
        break;
      }
      case 'provider_integration_created':
        console.log(`${user} connected ${provider}`);
        break;
      case 'provider_integration_deleted':
        console.log(`${user} disconnected ${provider}`);
        break;
      default:
        console.log('Unhandled event type:', eventType);
    }
  }

  // Spike API retries anything other than exactly HTTP 200
  res.sendStatus(200);
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Spike API webhook server listening on port ${PORT}`);
  });
}

module.exports = app;
