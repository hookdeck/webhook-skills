// Generated with: baserow-webhooks skill
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
 * Baserow does not sign payloads. You add a secret custom header to the webhook; the header name
 * is yours to choose (BASEROW_WEBHOOK_HEADER, default 'Authorization') and the expected value is
 * the exact, whole header value (BASEROW_WEBHOOK_SECRET), including any 'Bearer ' prefix you typed.
 * Do not strip or parse a prefix.
 */
function verifyBaserowRequest(
  headers,
  name = process.env.BASEROW_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.BASEROW_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { event_type: eventType, event_id: eventId } = payload;

  switch (eventType) {
    case 'rows.created':
      console.log(`Rows created (${eventId}): ${(payload.items || []).length} row(s)`);
      // TODO: sync payload.items to your system
      break;

    case 'rows.updated':
      console.log(`Rows updated (${eventId}): ${(payload.items || []).length} row(s)`);
      // TODO: apply payload.items changes
      break;

    case 'rows.deleted':
      console.log(`Rows deleted (${eventId})`);
      // TODO: remove the rows downstream
      break;

    case 'view.created':
    case 'view.updated':
    case 'view.deleted':
      console.log(`View event ${eventType} (${eventId})`);
      // TODO: audit the schema change (payload.view)
      break;

    case 'field.created':
    case 'field.updated':
    case 'field.deleted':
      console.log(`Field event ${eventType} (${eventId})`);
      // TODO: update your schema mirror (payload.field)
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// The sender chooses the method in Baserow, so accept all of them (a JSON body is sent even on GET).
// Read the body raw (any content type) so the request is authenticated before parsing.
function webhookHandler(req, res) {
  if (!verifyBaserowRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    // Empty body: nothing to dispatch.
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
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
    console.error('Error handling Baserow event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

for (const method of ['post', 'put', 'patch', 'get', 'delete']) {
  app[method]('/webhooks/baserow', express.raw({ type: '*/*' }), webhookHandler);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyBaserowRequest = verifyBaserowRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/baserow (POST, PUT, PATCH, GET, DELETE)`);
  });
}
