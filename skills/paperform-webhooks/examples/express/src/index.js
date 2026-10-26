// Generated with: paperform-webhooks skill
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
 * Paperform does not sign payloads. Authenticate with a secret custom header added to the
 * webhook (Custom headers toggle). The header name is user-chosen, and the whole header value
 * is compared (no Bearer parsing). A static credential authenticates the sender, not the body,
 * and gives no replay protection: use HTTPS and rotate it if it leaks.
 */
function verifyPaperformRequest(
  headers,
  {
    headerName = process.env.PAPERFORM_WEBHOOK_HEADER || 'Authorization',
    secret = process.env.PAPERFORM_WEBHOOK_SECRET,
  } = {}
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

// Paperform has no event types: the trigger (New Submission or Partial Submission) is a
// per-webhook setting. This example reads an optional ?trigger=new|partial query parameter
// that you add to the webhook URL yourself.
function handleSubmission(payload, trigger) {
  const { submission_id: id, data } = payload;
  const answers = Object.fromEntries(
    data.map((q) => [q.custom_key || q.key, q.value])
  );

  if (trigger === 'partial') {
    console.log(`Partial submission ${id}`, answers);
    // TODO: follow up on the abandoned form
  } else {
    console.log(`New submission ${id}`, answers);
    // TODO: create a record, notify a team (payload.charge is set for payments)
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/paperform', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPaperformRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
    return res.status(400).json({ error: 'Expected a JSON object with a data array' });
  }

  try {
    handleSubmission(payload, req.query.trigger === 'partial' ? 'partial' : 'new');
  } catch (err) {
    console.error('Error handling Paperform submission:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPaperformRequest = verifyPaperformRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paperform`);
  });
}
