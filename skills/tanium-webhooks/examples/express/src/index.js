// Generated with: tanium-webhooks skill
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
 * Tanium Connect does not sign requests. Header Authentication adds one header you
 * name (Auth Header Name) with the value you chose (Secret). Look the header up
 * case-insensitively and compare the WHOLE value: no 'Bearer ' parsing or stripping.
 * This is a static shared credential: it authenticates the sender, not the body,
 * and gives no replay protection.
 */
function verifyTaniumRequest(
  headers,
  secret = process.env.TANIUM_WEBHOOK_SECRET,
  headerName = process.env.TANIUM_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}

/**
 * The body is whatever the Connect connection is configured to send (the rows of
 * its source, with the columns the author picked); there is no vendor event field.
 * A batched run may be a JSON array of records, otherwise an object.
 */
function handleRecords(payload) {
  const records = Array.isArray(payload) ? payload : [payload];
  console.log(`Received ${records.length} record(s) from Tanium Connect`);
  // TODO: store or forward the records (e.g. records[0]['Computer Name'])
}

// Read the body raw (any content type) and authenticate before parsing.
// The HTTP destination's method is user-chosen, so accept POST, PUT and PATCH.
function webhookHandler(req, res) {
  if (!verifyTaniumRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing authentication header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  let payload = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (payload === null || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Expected a JSON object or array' });
    }
  }

  try {
    if (payload !== null) handleRecords(payload);
  } catch (err) {
    console.error('Error handling Tanium delivery:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

for (const method of ['post', 'put', 'patch']) {
  app[method]('/webhooks/tanium', express.raw({ type: '*/*' }), webhookHandler);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTaniumRequest = verifyTaniumRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST/PUT/PATCH http://localhost:${PORT}/webhooks/tanium`);
  });
}
