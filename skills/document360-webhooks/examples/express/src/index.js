// Generated with: document360-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Document360 does not sign payloads. You add a key-value header to the Webhook
 * channel; its name is your choice (DOCUMENT360_WEBHOOK_HEADER, default
 * "Authorization") and the expected value is the WHOLE header value
 * (DOCUMENT360_WEBHOOK_SECRET), including any "Bearer " prefix you typed.
 * Node lowercases incoming header names, so the lookup is case-insensitive.
 */
function verifyDocument360Request(
  headers,
  secret = process.env.DOCUMENT360_WEBHOOK_SECRET,
  headerName = process.env.DOCUMENT360_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

function handleEvent(payload) {
  // Payload keys are display labels with spaces, e.g. "Knowledge base name".
  const event = payload['Event'];
  const article = payload['Article name'];

  switch (event) {
    case 'Article published':
      console.log(`Article published: ${article}`);
      // TODO: notify the docs team or refresh a search index
      break;

    case 'Article created':
      console.log(`Article created: ${article}`);
      // TODO: add the article to a content tracker
      break;

    case 'Article deleted':
      console.log(`Article deleted: ${article}`);
      // TODO: purge cache entries for every language in payload['Slugs']
      break;

    case 'Article settings saved':
      console.log(`Article settings saved: ${article}`);
      // TODO: re-sync article metadata
      break;

    case 'Article workflow status updated':
      console.log(`Article workflow status updated: ${article}`);
      // TODO: trigger the downstream review step
      break;

    case 'Extension token deleted':
      console.log(`Extension token deleted: ${payload['Extension']}`);
      // TODO: alert the integration owner
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Document360 lets the user pick POST or PUT, so the route accepts both. The body is read
// raw (any content type) and only parsed after the credential check.
function webhookHandler(req, res) {
  if (!verifyDocument360Request(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    // Empty body: nothing to dispatch, but the sender is authenticated.
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
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
    console.error('Error handling Document360 event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

const rawBody = express.raw({ type: '*/*' });
app.post('/webhooks/document360', rawBody, webhookHandler);
app.put('/webhooks/document360', rawBody, webhookHandler);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyDocument360Request = verifyDocument360Request;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST or PUT http://localhost:${PORT}/webhooks/document360`);
  });
}
