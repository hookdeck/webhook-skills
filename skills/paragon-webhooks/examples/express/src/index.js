// Generated with: paragon-webhooks skill
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
 * Paragon does not sign Webhook Destination requests. You add a header (name and value
 * are yours to choose) under "Show more request options". We compare the WHOLE header
 * value with PARAGON_WEBHOOK_SECRET: a "Bearer " prefix is not parsed or stripped.
 * Express lowercases incoming header names, so the lookup is case-insensitive.
 */
function verifyParagonRequest(
  headers,
  secret = process.env.PARAGON_WEBHOOK_SECRET,
  headerName = process.env.PARAGON_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { type, message } = payload;

  switch (type) {
    case 'workflow_failure':
      console.log(`Workflow failed: ${message}`);
      // TODO: alert the team (payload.workflow, payload.user, payload.data.error, payload.data.executionUrl)
      break;

    case 'credentials_failure':
      console.log(`Credential failed: ${message}`);
      // TODO: ask payload.user.id to reconnect payload.integration.type in your Connect Portal
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/paragon', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyParagonRequest(req.headers)) {
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
    console.error('Error handling Paragon event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyParagonRequest = verifyParagonRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paragon`);
  });
}
