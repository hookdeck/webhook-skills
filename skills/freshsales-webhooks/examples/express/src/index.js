// Generated with: freshsales-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// The workflow's request type is user-chosen, so accept all of these.
const METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];

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
 * Freshsales does not sign webhooks. Authenticate with a secret custom header you
 * add on the workflow's Trigger webhook action. The header name is yours to choose
 * (FRESHSALES_WEBHOOK_HEADER); the WHOLE header value must equal
 * FRESHSALES_WEBHOOK_SECRET. No "Bearer " parsing: a prefix is part of the value.
 */
function verifyFreshsalesRequest(
  headers,
  secret = process.env.FRESHSALES_WEBHOOK_SECRET,
  headerName = process.env.FRESHSALES_WEBHOOK_HEADER || 'X-Webhook-Secret'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

/**
 * Freshsales sends no event type: the body is whatever the workflow author chose
 * (Simple fields or Advanced content with placeholders). This example assumes an
 * illustrative Advanced body with a top-level "deal" or "contact" object.
 */
function handlePayload(method, payload) {
  if (payload && payload.deal) {
    console.log(`Deal webhook (${method}): ${payload.deal.id} ${payload.deal.name || ''}`);
    // TODO: sync the deal (payload.deal.amount, payload.deal.stage)
    return 'deal';
  }
  if (payload && payload.contact) {
    console.log(`Contact webhook (${method}): ${payload.contact.id} ${payload.contact.email || ''}`);
    // TODO: sync the contact (payload.contact.first_name, payload.contact.email)
    return 'contact';
  }
  console.log(`Freshsales webhook (${method}) with no deal or contact object`);
  return 'unknown';
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/freshsales', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.includes(req.method)) {
    res.set('Allow', METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyFreshsalesRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  // GET and DELETE carry no body; express.raw leaves req.body unset (or empty).
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body (set Encoding to JSON)' });
    }
  }

  try {
    handlePayload(req.method, payload);
  } catch (err) {
    console.error('Error handling Freshsales webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFreshsalesRequest = verifyFreshsalesRequest;
module.exports.handlePayload = handlePayload;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: ${METHODS.join('|')} http://localhost:${PORT}/webhooks/freshsales`);
  });
}
