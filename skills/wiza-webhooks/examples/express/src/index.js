// Generated with: wiza-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Lengths are checked first because
 * timingSafeEqual throws on unequal-length buffers.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Wiza does not sign the body. Every webhook carries an x-auth-key header: the lowercase hex
 * SHA-256 of your Wiza API key. It is the same on every request, so it proves who sent the
 * request, not that the body is intact, and it gives no replay protection.
 */
function verifyWizaRequest(headers, apiKey = process.env.WIZA_API_KEY) {
  if (!apiKey) return false; // never accept when unconfigured
  const received = headers['x-auth-key'];
  if (!received) return false;
  const expected = crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
  return safeEqual(received, expected);
}

function handleEvent(payload) {
  const { type, status, data } = payload;
  const id = data && data.id; // the reveal's id; the envelope has no top-level id

  switch (type) {
    case 'individual_reveal':
      if (status && status.code === 200) {
        console.log(`Reveal ${id} finished`);
        // TODO: store the contact details in `data`
      } else if (status && status.code === 400) {
        console.log(`Reveal ${id} failed`);
        // TODO: flag the lookup as failed or retry it
      } else {
        console.log(`Reveal ${id} has status ${status && status.code}`);
      }
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/wiza', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyWizaRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing x-auth-key' });
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
    console.error('Error handling Wiza event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyWizaRequest = verifyWizaRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/wiza`);
  });
}
