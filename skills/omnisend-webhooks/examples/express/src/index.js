// Generated with: omnisend-webhooks skill
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
 * Omnisend does not sign webhooks. Authenticate with a shared secret header you add to the
 * automation's send webhook action. The header name is user-chosen, so it comes from
 * OMNISEND_WEBHOOK_HEADER; the whole header value must equal OMNISEND_WEBHOOK_SECRET
 * (no Bearer parsing). This authenticates the sender, not the body, and gives no replay protection.
 */
function verifyOmnisendRequest(headers, {
  headerName = process.env.OMNISEND_WEBHOOK_HEADER || 'X-Webhook-Secret',
  secret = process.env.OMNISEND_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && safeEqual(received, secret);
}

// The body is the author's JSON template, so `event` is whatever the template sets.
function handleEvent(payload) {
  const { event } = payload;

  switch (event) {
    case 'subscribed':
      console.log(`Contact subscribed: ${payload.contactEmail}`);
      // TODO: add the contact to your CRM or messaging tool
      break;

    case 'placed order':
      console.log(`Order placed by: ${payload.contactEmail}`);
      // TODO: sync the order (use [[event.raw.<property>]] tags for order data)
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/omnisend', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyOmnisendRequest(req.headers)) {
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
    console.error('Error handling Omnisend event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyOmnisendRequest = verifyOmnisendRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/omnisend`);
  });
}
