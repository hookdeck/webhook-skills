// Generated with: soniox-webhooks skill
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
 * Soniox does not sign payloads. It sends the header you set per transcription via
 * webhook_auth_header_name / webhook_auth_header_value. Look the header up
 * case-insensitively and compare the WHOLE value (no Bearer parsing).
 * This authenticates the sender only: no signature, no timestamp, no replay protection.
 */
function verifySonioxRequest(headers, {
  name = process.env.SONIOX_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.SONIOX_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleTranscription(payload) {
  const { id, status } = payload;

  switch (status) {
    case 'completed':
      console.log(`Transcription completed: ${id}`);
      // TODO: fetch the transcript from the Soniox API by id
      break;

    case 'error':
      console.log(`Transcription failed: ${id}`);
      // TODO: look up the transcription by id, alert or retry
      break;

    default:
      console.log(`Unhandled status: ${status}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/soniox', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifySonioxRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook auth header' });
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
    handleTranscription(payload);
  } catch (err) {
    console.error('Error handling Soniox webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySonioxRequest = verifySonioxRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/soniox`);
  });
}
