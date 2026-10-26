// Generated with: govuk-notify-webhooks skill
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

const BEARER = 'bearer ';

/**
 * GOV.UK Notify does not sign callbacks. It sends `Authorization: Bearer <token>`, where the
 * token is the one you set for the callback. The secret is the BARE token; if the configured
 * value itself starts with "Bearer " (any case) that prefix is stripped, as Hookdeck does.
 * The scheme is matched case-insensitively (RFC 9110); the token is never trimmed.
 */
function verifyNotifyRequest(headers, secret = process.env.GOVUK_NOTIFY_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const expected = secret.toLowerCase().startsWith(BEARER) ? secret.slice(BEARER.length) : secret;
  if (!expected) return false;

  const header = headers['authorization'];
  if (typeof header !== 'string' || !header.toLowerCase().startsWith(BEARER)) return false;
  return safeEqual(header.slice(BEARER.length), expected);
}

/** Callbacks have no event field: tell the three kinds apart by shape. */
function classifyCallback(payload) {
  if (typeof payload.status === 'string' && 'notification_type' in payload) return 'delivery_receipt';
  if ('source_number' in payload && 'destination_number' in payload) return 'received_text';
  if ('notification_id' in payload && 'date_sent' in payload) return 'returned_letter';
  return 'unknown';
}

function handleCallback(payload) {
  switch (classifyCallback(payload)) {
    case 'delivery_receipt':
      // status: delivered, permanent-failure, temporary-failure, technical-failure
      console.log(`Delivery receipt ${payload.id}: ${payload.status} (${payload.notification_type})`);
      // TODO: update the notification by payload.reference / payload.id; retry or alert on failures
      break;

    case 'received_text':
      console.log(`Text message from ${payload.source_number}: ${payload.message}`);
      // TODO: route the reply (payload.destination_number, payload.date_received)
      break;

    case 'returned_letter':
      console.log(`Letter returned: ${payload.notification_id}`);
      // TODO: flag the address as bad (payload.reference, payload.template_name)
      break;

    default:
      console.log('Unhandled GOV.UK Notify callback shape');
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/govuk-notify', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyNotifyRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization bearer token' });
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
    handleCallback(payload);
  } catch (err) {
    console.error('Error handling GOV.UK Notify callback:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyNotifyRequest = verifyNotifyRequest;
module.exports.classifyCallback = classifyCallback;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/govuk-notify`);
  });
}
