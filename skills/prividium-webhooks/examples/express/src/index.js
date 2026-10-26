// Generated with: prividium-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// webhook-id is stable across retries. This in-memory set is for illustration only:
// persist ids in durable storage before applying side effects in production.
const processedIds = new Set();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Prividium sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// PRIVIDIUM_WEBHOOK_SECRET is the full whsec_ value. During a key rotation you may list the old and
// new keys separated by commas; a delivery passes if any one of them verifies it.
function readSecrets() {
  const secrets = (process.env.PRIVIDIUM_WEBHOOK_SECRET || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return secrets.length > 0 && secrets.every((s) => s.startsWith('whsec_')) ? secrets : null;
}

// IMPORTANT: express.raw() keeps the exact bytes Prividium signed, whatever the content type
app.post('/webhooks/prividium', express.raw({ type: '*/*' }), (req, res) => {
  const secrets = readSecrets();
  if (!secrets) {
    console.error('PRIVIDIUM_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const headers = readSignatureHeaders(req.headers);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
  // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
  let lastError;
  const verified = secrets.some((secret) => {
    try {
      new Webhook(secret).verify(rawBody, headers, { jsonParse: false });
      return true;
    } catch (err) {
      lastError = err;
      return false;
    }
  });
  if (!verified) {
    console.error('Prividium webhook verification failed:', lastError && lastError.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const id = headers['webhook-id'];
  if (processedIds.has(id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  // The body format is not printed in Prividium's docs, so parse it only after verification
  // and don't reject a body that isn't JSON.
  let payload = null;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    console.log(`Prividium webhook ${id}: body is not JSON (${rawBody.length} bytes)`);
  }

  // One webhook is one subscription (an event webhook = contract + topic0, an address webhook = addresses),
  // so the route or the webhook's name tells you what it watches. Add your own handling here.
  console.log(`Received Prividium webhook ${id}`, payload === null ? '' : payload);

  processedIds.add(id);
  res.status(200).json({ received: true, duplicate: false });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Prividium webhook server running on http://localhost:${PORT}/webhooks/prividium`);
  });
}

module.exports = app;
