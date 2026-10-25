// Generated with: pax8-webhooks skill
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
 * Pax8 does not sign payloads. It sends the `authorization` value you set on the webhook
 * back in the `Authorization` header exactly as entered. Compare the WHOLE header value,
 * including any "Bearer " or "Basic " prefix: don't strip, parse or base64-decode it.
 * This authenticates the sender only; it gives no body integrity or replay protection.
 */
function verifyPax8Request(headers, config = process.env) {
  const expected = config.PAX8_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * The body is not documented (samplePayload is elided), so read topic and action
 * defensively. Both are returned upper-case, or null when absent.
 */
function classify(payload) {
  const norm = (v) => (typeof v === 'string' && v ? v.toUpperCase() : null);
  return { topic: norm(payload.topic), action: norm(payload.action) };
}

function handleEvent(payload) {
  const { topic, action } = classify(payload);

  // SUBSCRIPTION and PRODUCT are the topic values the docs show; INVOICE, CLIENT, QUOTE
  // and USER are assumed from the docs' event category names. Check topic-definitions.
  switch (topic) {
    case 'SUBSCRIPTION':
      console.log(`Pax8 subscription ${action}`);
      // TODO: sync the subscription (the docs show the CREATE action) to your system
      break;

    case 'INVOICE':
      console.log(`Pax8 invoice ${action}`);
      // TODO: import the invoice into billing
      break;

    case 'CLIENT':
      console.log(`Pax8 client ${action}`);
      // TODO: update your customer record
      break;

    case 'PRODUCT':
      console.log(`Pax8 product ${action}`);
      // TODO: refresh your catalog cache
      break;

    case 'QUOTE':
      console.log(`Pax8 quote ${action}`);
      // TODO: sync the quote
      break;

    case 'USER':
      console.log(`Pax8 user ${action}`);
      // TODO: sync the user
      break;

    default:
      console.log('Unclassified Pax8 payload (no recognized topic)');
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Pax8 uses.
app.post('/webhooks/pax8', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPax8Request(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
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
    console.error('Error handling Pax8 webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Pax8 marks a delivery failed after 10 seconds: acknowledge quickly.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPax8Request = verifyPax8Request;
module.exports.classify = classify;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pax8`);
  });
}
