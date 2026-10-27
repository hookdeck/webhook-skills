// Generated with: memos-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Memos sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// A whsec_ secret is base64-decoded after the prefix; any other value is used as its raw bytes (as Memos does)
function createVerifier(secret) {
  return secret.startsWith('whsec_')
    ? new Webhook(secret)
    : new Webhook(Buffer.from(secret, 'utf8'), { format: 'raw' });
}

// Memos treats any response without JSON {"code":0} as a failed delivery, so every accepted delivery gets it
const ACK = { code: 0 };

// IMPORTANT: express.raw() keeps the exact bytes Memos signed, whatever the content type
app.post('/webhooks/memos', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.MEMOS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MEMOS_WEBHOOK_SECRET is not set');
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
    createVerifier(secret).verify(rawBody, headers, { jsonParse: false });
  } catch (err) {
    console.error('Memos webhook verification failed:', err.message);
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

  // The body is { url, activityType, creator, memo }; the event name is the top-level activityType
  const { activityType, creator } = event;
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Memos webhook ${headers['webhook-id']}: ${activityType}`);

  switch (activityType) {
    case 'memos.memo.created':
      console.log('Memo created by:', creator);
      break;
    case 'memos.memo.updated':
      console.log('Memo updated by:', creator);
      break;
    case 'memos.memo.deleted':
      console.log('Memo deleted by:', creator);
      break;
    case 'memos.memo.comment.created':
      console.log('Memo comment created by:', creator);
      break;
    default:
      // The documented list may grow: acknowledge what you don't handle so Memos doesn't count a failure
      console.log('Unhandled activity type:', activityType);
  }

  res.status(200).json(ACK);
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Memos webhook server running on http://localhost:${PORT}/webhooks/memos`);
  });
}

module.exports = app;
