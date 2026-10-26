// Generated with: firstbase-webhooks skill
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
 * Firstbase does not sign payloads. With Custom header authentication it sends the header
 * name and value you entered. Compare the WHOLE value (no Bearer parsing). Node lowercases
 * incoming header names, so the lookup is case-insensitive.
 */
function verifyFirstbaseRequest(
  headers,
  headerName = process.env.FIRSTBASE_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.FIRSTBASE_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { eventType } = payload;

  switch (eventType) {
    case 'CREATED':
      console.log(`Firstbase resource created: ${payload.id}`);
      // TODO: fetch the new order / return order / inventory order from the Firstbase API
      break;

    case 'UPDATED':
      console.log(`Firstbase resource updated: ${payload.id}`);
      // TODO: re-fetch the resource and sync your records
      break;

    case 'DELETED':
      console.log(`Firstbase resource deleted: ${payload.id}`);
      // TODO: remove or archive the resource locally
      break;

    default:
      console.log(`Unhandled eventType: ${eventType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/firstbase', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyFirstbaseRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
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
    console.error('Error handling Firstbase event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFirstbaseRequest = verifyFirstbaseRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/firstbase`);
  });
}
