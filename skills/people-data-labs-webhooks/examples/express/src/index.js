// Generated with: people-data-labs-webhooks skill
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
 * PDL does not sign payloads. The webhook carries the header the PDL team was
 * asked to add at registration. The header name is user-chosen; the expected value
 * is the exact, whole header value (a "Bearer " prefix, if any, is part of it).
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection, so use HTTPS and rotate the credential if it leaks.
 */
function verifyPdlRequest(headers, {
  name = (process.env.PEOPLE_DATA_LABS_WEBHOOK_HEADER || 'Authorization').toLowerCase(),
  secret = process.env.PEOPLE_DATA_LABS_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

// The payload is a JSON array of PDL IDs (up to 1,000) for records updated in a release.
function handleEvent(ids) {
  console.log(`Person record update batch: ${ids.length} ids`);
  // TODO: dedupe (an ID repeats when several filters match), store the IDs,
  // then re-enrich them with the Person Enrichment API
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/people-data-labs', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPdlRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!Array.isArray(payload) || !payload.every((id) => typeof id === 'string')) {
    return res.status(400).json({ error: 'Expected a JSON array of PDL ids' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling People Data Labs batch:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPdlRequest = verifyPdlRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/people-data-labs`);
  });
}
