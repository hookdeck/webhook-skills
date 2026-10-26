// Generated with: youcanbookme-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Hashing both sides gives equal-length buffers, so timingSafeEqual never throws.
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest();

/**
 * YouCanBookMe does not sign payloads. You add a secret Request Header (name and value of your
 * choosing) to the webhook action; compare the WHOLE header value, case-insensitive name.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifyYoucanbookmeRequest(headers, {
  headerName = process.env.YOUCANBOOKME_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.YOUCANBOOKME_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && crypto.timingSafeEqual(sha256(received), sha256(secret));
}

// The body is the owner's template, so `event` is whatever the template names.
function handleEvent(payload) {
  const { event } = payload;

  switch (event) {
    case 'booking_made':
      console.log(`Booking made: ${payload.email}`);
      // TODO: create the CRM contact or calendar entry
      break;

    case 'booking_rescheduled':
      console.log(`Booking rescheduled: ${payload.email}`);
      // TODO: move the matching record
      break;

    case 'booking_cancelled':
      console.log(`Booking cancelled: ${payload.email}`);
      // TODO: cancel downstream work
      break;

    case 'reminder':
      console.log(`Reminder: ${payload.email}`);
      // TODO: send a nudge
      break;

    case 'follow_up':
      console.log(`Follow-up: ${payload.email}`);
      // TODO: trigger a survey or thank-you
      break;

    case 'no_show':
      console.log(`No-show: ${payload.email}`);
      // TODO: flag the contact
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// The method is user-chosen in YouCanBookMe, so accept all of these.
// Read the body raw (any content type) so the request is authenticated before parsing.
function webhookHandler(req, res) {
  if (!verifyYoucanbookmeRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  // An empty body (e.g. GET) is valid: acknowledge it.
  if (raw.trim() === '') {
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
    console.error('Error handling YouCanBookMe event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

for (const method of ['post', 'put', 'patch', 'delete', 'get']) {
  app[method]('/webhooks/youcanbookme', express.raw({ type: '*/*' }), webhookHandler);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyYoucanbookmeRequest = verifyYoucanbookmeRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/youcanbookme`);
  });
}
