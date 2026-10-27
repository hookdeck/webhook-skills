// Generated with: openlayer-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Openlayer sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Openlayer signed, whatever the content type
app.post('/webhooks/openlayer', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.OPENLAYER_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('OPENLAYER_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const headers = readSignatureHeaders(req.headers);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(rawBody, headers, { jsonParse: false });
  } catch (err) {
    console.error('Openlayer webhook verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (typeof event !== 'object' || event === null) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Every body is { type, timestamp, data }: the event name is the dotted top-level `type`
  // (data.test.type is the test's own category, not the event type)
  const { type } = event;
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  // webhook-id is stable across retries: use it to deduplicate. Order events by event.timestamp.
  console.log(`Received Openlayer webhook ${headers['webhook-id']}: ${type}`);

  switch (type) {
    case 'test.created':
      console.log('Test created:', data.test?.id, data.test?.name, data.test?.type);
      break;
    case 'test.updated':
      console.log('Test updated:', data.test?.id, data.test?.name);
      break;
    case 'test.deleted':
      // Only the test id is sent after deletion
      console.log('Test deleted:', data.test?.id);
      break;
    case 'tests.result.updated': {
      // One event per suite run; alert when anything failed
      const run = data.tests ?? {};
      console.log(`Test run finished: ${run.passing}/${run.total} passing, ${run.failing} failing, ${run.skipped} skipped, ${run.running} running`);
      if (run.failing > 0) console.log('ALERT: failing tests in project', run.projectId);
      break;
    }
    default:
      // The documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ received: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Openlayer webhook server running on http://localhost:${PORT}/webhooks/openlayer`);
  });
}

module.exports = app;
