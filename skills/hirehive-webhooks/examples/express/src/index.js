// Generated with: hirehive-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// HireHive sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes HireHive signed, whatever the content type
app.post('/webhooks/hirehive', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.HIREHIVE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('HIREHIVE_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('HireHive webhook verification failed:', err.message);
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

  // The body is { type, timestamp, data }: the event name is the top-level `type`, and `timestamp` is ISO 8601
  const { type } = event;
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received HireHive webhook ${headers['webhook-id']}: ${type}`);

  switch (type) {
    case 'job.created':
      console.log('Job created');
      break;
    case 'job.updated':
      console.log('Job updated');
      break;
    case 'job.status.updated':
      console.log('Job status updated');
      break;
    case 'job.deleted':
      console.log('Job deleted');
      break;
    case 'application.created':
      console.log('Application created');
      break;
    case 'application.stage.updated':
      console.log('Application stage updated');
      break;
    case 'application.deleted':
      console.log('Application deleted');
      break;
    case 'candidate.updated':
      console.log('Candidate updated');
      break;
    case 'candidate.note.created':
      console.log('Candidate note created');
      break;
    case 'candidate.note.updated':
      console.log('Candidate note updated');
      break;
    case 'candidate.note.deleted':
      console.log('Candidate note deleted');
      break;
    case 'candidate.tag.added':
      console.log('Candidate tag added');
      break;
    case 'candidate.tag.removed':
      console.log('Candidate tag removed');
      break;
    case 'feedback.requested':
      console.log('Feedback requested');
      break;
    case 'feedback.submitted':
      console.log('Feedback submitted');
      break;
    case 'feedback.updated':
      console.log('Feedback updated');
      break;
    case 'interview.created':
      console.log('Interview created');
      break;
    case 'interview.updated':
      console.log('Interview updated');
      break;
    case 'interview.cancelled':
      console.log('Interview cancelled');
      break;
    default:
      // The documented list may grow: acknowledge and ignore what you don't handle
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ received: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`HireHive webhook server running on http://localhost:${PORT}/webhooks/hirehive`);
  });
}

module.exports = app;
