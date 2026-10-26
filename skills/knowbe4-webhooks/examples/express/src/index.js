// Generated with: knowbe4-webhooks skill
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
 * KnowBe4 does not sign webhooks. You add a custom header (Key and Value) to the KSAT or
 * PhishER webhook; its name is yours to choose. Look it up case-insensitively and compare
 * the WHOLE value (do not strip a "Bearer " prefix). A static secret authenticates the
 * sender, not the body, and gives no replay protection.
 */
function verifyKnowbe4Request(headers, config = process.env) {
  const expected = config.KNOWBE4_WEBHOOK_SECRET;
  if (!expected) return false; // never accept when unconfigured
  const name = (config.KNOWBE4_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name]; // Node lowercases incoming header names
  return Boolean(received) && safeEqual(received, expected);
}

/**
 * The body is defined by your own webhook configuration and KnowBe4 documents no event
 * field. ILLUSTRATIVE: this example reads an `event_type` string, e.g. the UI label
 * "Phish Failure Removed". Inspect a real delivery and adapt.
 */
function handleEvent(payload) {
  const eventType = typeof payload.event_type === 'string' ? payload.event_type : null;

  switch (eventType) {
    case 'Phish Failure Removed':
      console.log('KSAT: phish failure removed');
      // TODO: update the user's risk record in your system
      break;

    default:
      console.log(`KnowBe4 payload received${eventType ? ` (${eventType})` : ''}`);
      // TODO: route PhishER message data or other KSAT events here
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/knowbe4', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyKnowbe4Request(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook header' });
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
    console.error('Error handling KnowBe4 webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyKnowbe4Request = verifyKnowbe4Request;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/knowbe4`);
  });
}
