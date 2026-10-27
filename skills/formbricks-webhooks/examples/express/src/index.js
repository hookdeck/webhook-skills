// Generated with: formbricks-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Formbricks sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Formbricks signed, whatever the content type
app.post('/webhooks/formbricks', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.FORMBRICKS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('FORMBRICKS_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Formbricks webhook verification failed:', err.message);
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

  // The body is { event, data, webhookId }: `event` names the trigger, `data` is the response
  // (answers are in data.data, a summary of the survey in data.survey)
  const { event: eventType, data = {} } = event;
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Formbricks webhook ${headers['webhook-id']}: ${eventType}`);

  switch (eventType) {
    case 'responseCreated':
      console.log('Response created:', data.id, 'survey', data.surveyId);
      break;
    case 'responseUpdated':
      console.log('Response updated:', data.id, 'survey', data.surveyId);
      break;
    case 'responseFinished':
      console.log('Response finished:', data.id, 'survey', data.surveyId);
      break;
    default:
      // The documented list may not be exhaustive: ignore what you don't need
      console.log('Unhandled event type:', eventType);
  }

  res.status(200).json({ received: true, event: eventType ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Formbricks webhook server running on http://localhost:${PORT}/webhooks/formbricks`);
  });
}

module.exports = app;
