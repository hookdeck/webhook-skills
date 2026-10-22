// Generated with: prefect-webhooks skill
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
 * Prefect does not sign Custom Webhook notifications. You add a secret header in the
 * block's headers; the header name is yours, so it comes from PREFECT_WEBHOOK_HEADER
 * (default "Authorization"). Compare the WHOLE value with PREFECT_WEBHOOK_SECRET:
 * do not strip a "Bearer " prefix.
 */
function verifyPrefectRequest(
  headers,
  secret = process.env.PREFECT_WEBHOOK_SECRET,
  headerName = process.env.PREFECT_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

/**
 * Prefect adds no event field: the body is whatever json_data / form_data template you
 * configured on the block, with {{subject}}, {{body}} and {{name}} substituted. This
 * example assumes an illustrative template:
 *   {"subject": "{{subject}}", "body": "{{body}}", "name": "{{name}}"}
 */
function handleNotification(payload) {
  const { subject, body, name } = payload;
  console.log(`Prefect notification from "${name}": ${subject}`);
  console.log(body);
  // TODO: route by your own convention, e.g. match subject text or add a field to the template
}

// Parse only after the credential check. Empty bodies (e.g. GET) are valid.
function parseBody(buf, contentType = '') {
  const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : '';
  if (!text.trim()) return {};
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object');
  }
  return parsed;
}

// The block's method is configurable (POST by default), so accept all of these.
// Read the body raw (any content type) so the request is authenticated before parsing.
function webhookRoute(req, res) {
  if (!verifyPrefectRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  let payload;
  try {
    payload = parseBody(req.body, req.headers['content-type']);
  } catch {
    return res.status(400).json({ error: 'Invalid body' });
  }

  try {
    handleNotification(payload);
  } catch (err) {
    console.error('Error handling Prefect notification:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

const raw = express.raw({ type: '*/*' });
app.route('/webhooks/prefect')
  .post(raw, webhookRoute)
  .put(raw, webhookRoute)
  .patch(raw, webhookRoute)
  .get(raw, webhookRoute);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPrefectRequest = verifyPrefectRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/prefect (POST, PUT, PATCH, GET)`);
  });
}
