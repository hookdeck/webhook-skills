// Generated with: ukg-ready-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * UKG Ready (Ready only, not UKG Pro) does not sign payloads. With Bearer Token
 * authentication it is expected to send `Authorization: Bearer <token>`. Compare the WHOLE header
 * value, including the "Bearer " prefix: do not strip, parse or base64-decode it.
 */
function verifyUkgReadyRequest(headers, config = process.env) {
  const expected = config.UKG_READY_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * The payload shape is chosen per subscription and shown only in the UKG Ready app, and
 * it carries no documented event-type field (ACCOUNT_CREATED / ACCOUNT_UPDATED are
 * subscription categories). Treat it as the latest values of the selected fields.
 */
function handlePayload(payload) {
  console.log(`UKG Ready webhook with fields: ${Object.keys(payload).join(', ')}`);
  // TODO: sync the changed employee/account fields to your system (idempotently)
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type UKG Ready uses.
app.post('/webhooks/ukg-ready', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyUkgReadyRequest(req.headers)) {
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
    handlePayload(payload);
  } catch (err) {
    console.error('Error handling UKG Ready webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyUkgReadyRequest = verifyUkgReadyRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ukg-ready`);
  });
}
