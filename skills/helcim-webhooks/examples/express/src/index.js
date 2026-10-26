// Generated with: helcim-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Helcim sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Helcim signed, whatever the content type
app.post('/webhooks/helcim', express.raw({ type: '*/*' }), (req, res) => {
  // The verifierToken exactly as Helcim shows it (bare base64). The library also accepts a whsec_ prefix.
  const secret = process.env.HELCIM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('HELCIM_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const headers = readSignatureHeaders(req.headers);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` (key = base64-decoded verifierToken)
    // against every v1, signature and enforces a fixed 5-minute timestamp window
    // (see references/verification.md to change that).
    new Webhook(secret).verify(rawBody, headers, { jsonParse: false });
  } catch (err) {
    console.error('Helcim webhook verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `type`. cardTransaction is thin: { id, type }.
  // terminalCancel is { data, type }. webhook-id is stable across retries: use it to deduplicate.
  const { type } = event;
  console.log(`Received Helcim webhook ${headers['webhook-id']}: ${type}`);

  switch (type) {
    case 'cardTransaction':
      // Only the card transaction ID is sent: fetch the rest with Get Card Transaction by ID
      console.log('Card transaction:', event.id);
      break;
    case 'terminalCancel': {
      const data = event.data ?? {};
      console.log('Terminal cancel:', data.deviceCode, data.transactionAmount, data.currency);
      break;
    }
    default:
      // Helcim's documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ received: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Helcim webhook server running on http://localhost:${PORT}/webhooks/helcim`);
  });
}

module.exports = app;
