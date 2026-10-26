// Generated with: pganalyze-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// pganalyze sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes pganalyze signed, whatever the content type
app.post('/webhooks/pganalyze', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.PGANALYZE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('PGANALYZE_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('pganalyze webhook verification failed:', err.message);
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

  // Every body is { type, id, timestamp, version, organization, data }: the event name is the top-level `type`
  const { type } = event;
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  const issue = data.issue && typeof data.issue === 'object' ? data.issue : {};
  // webhook-id (also the body `id`) is stable across retries: use it to deduplicate
  console.log(`Received pganalyze webhook ${headers['webhook-id']}: ${type}`);

  switch (type) {
    case 'issue.triggered':
      console.log('Issue triggered:', issue.id, issue.severity, issue.checkKind, '-', issue.description);
      break;
    case 'issue.escalated':
      console.log('Issue escalated:', issue.id, issue.severity, issue.checkKind, 'on', data.server?.name);
      break;
    case 'issue.downgraded':
      console.log('Issue downgraded:', issue.id, issue.severity, issue.checkKind, 'on', data.server?.name);
      break;
    case 'issue.acknowledged':
      console.log('Issue acknowledged:', issue.id, issue.checkKind);
      break;
    case 'issue.reopened':
      console.log('Issue reopened:', issue.id, issue.checkKind);
      break;
    case 'issue.resolved':
      console.log('Issue resolved:', issue.id, issue.checkKind);
      break;
    case 'ping':
      // Sent by "Test and Add" and "Send test": a test event, nothing to answer
      console.log('Ping received for endpoint:', data.endpoint?.name);
      break;
    default:
      // The documented list may not be exhaustive: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ received: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`pganalyze webhook server running on http://localhost:${PORT}/webhooks/pganalyze`);
  });
}

module.exports = app;
