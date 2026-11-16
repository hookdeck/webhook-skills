// Generated with: timify-webhooks skill
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
 * TIMIFY does not sign payloads. When "Include header name" is enabled on the webhook
 * subscription, every request carries the header name and secret value you chose.
 * Compare the WHOLE header value (no Bearer parsing). The header name is user-chosen.
 * Node lowercases incoming header names, so the lookup is case-insensitive.
 */
function verifyTimifyRequest(
  headers,
  secret = process.env.TIMIFY_WEBHOOK_SECRET,
  headerName = process.env.TIMIFY_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}

/**
 * TIMIFY's webhook overview names each webhook (Customers, Event, Resource, ...) and its type
 * (Created, Updated, Deleted), but documents no payload fields, so this handler doesn't guess
 * which field carries them. Give each webhook scope its own subscription and Server URL, as
 * TIMIFY suggests, or capture one delivery and branch on the field it actually uses.
 */
function handleEvent(payload) {
  console.log(`TIMIFY webhook received with fields: ${Object.keys(payload).join(', ')}`);
  // Process the delivery here
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/timify', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyTimifyRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing TIMIFY webhook header' });
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
    console.error('Error handling TIMIFY event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTimifyRequest = verifyTimifyRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/timify`);
  });
}
