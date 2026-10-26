// Generated with: builder-io-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Lengths are checked first because
 * timingSafeEqual throws on buffers of different length.
 */
function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Builder.io does not sign webhooks. Authenticate with the secret custom header you added to the
 * webhook. The header name is yours to choose; the secret is the exact, whole header value
 * (including any "Bearer " prefix). A static credential authenticates the sender, not the body,
 * and gives no replay protection: use HTTPS and rotate it if it leaks.
 */
function verifyBuilderRequest(headers, {
  header = process.env.BUILDER_IO_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.BUILDER_IO_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[header.toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { operation, modelName, newValue, previousValue } = payload;

  switch (operation) {
    case 'publish':
      console.log(`Published ${modelName}: ${newValue && newValue.id}${previousValue ? '' : ' (first publish)'}`);
      // TODO: sync newValue to your database or bust the CDN cache
      break;

    case 'unpublish':
      console.log(`Unpublished ${modelName}: ${newValue && newValue.id}`);
      // TODO: remove the entry from search or a CDN
      break;

    case 'archive':
      console.log(`Archived ${modelName}: ${newValue && newValue.id}`);
      // TODO: hide or retire the entry downstream
      break;

    case 'delete':
      console.log(`Deleted ${modelName}: ${previousValue && previousValue.id}`);
      // TODO: delete the mirrored record (newValue is null)
      break;

    case 'scheduledStart':
      console.log(`Scheduled publish started for ${modelName}: ${newValue && newValue.id}`);
      // TODO: warm caches for content going live
      break;

    case 'scheduledEnd':
      console.log(`Scheduled publish ended for ${modelName}: ${newValue && newValue.id}`);
      // TODO: expire the content downstream
      break;

    default:
      console.log(`Unhandled operation: ${operation}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/builder-io', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyBuilderRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
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
    console.error('Error handling Builder.io event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyBuilderRequest = verifyBuilderRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/builder-io`);
  });
}
