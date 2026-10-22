// Generated with: amplitude-webhooks skill
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
 * Amplitude does not sign webhook requests. You add a secret header in the
 * destination's header rows; the name is your choice. Node lowercases header
 * names, so the lookup is case-insensitive. The WHOLE value is compared: a
 * "Bearer " prefix typed in Amplitude is part of the expected secret.
 */
function verifyAmplitudeRequest(
  headers,
  secret = process.env.AMPLITUDE_WEBHOOK_SECRET,
  headerName = process.env.AMPLITUDE_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

// Default payloads: an event follows Amplitude's event format (has event_type);
// a user update follows the user format (user_id and/or device_id, user_properties).
// A FreeMarker template changes the shape, so branch on what your template emits.
function handlePayload(payload) {
  if (typeof payload.event_type === 'string') {
    console.log(`Event ${payload.event_type} for user ${payload.user_id ?? payload.device_id}`);
    // TODO: use payload.event_properties, payload.user_properties, payload.event_time
    return;
  }

  if (payload.user_id !== undefined || payload.device_id !== undefined) {
    console.log(`User properties update for ${payload.user_id ?? payload.device_id}`);
    // TODO: sync payload.user_properties
    return;
  }

  console.log('Unrecognised payload shape (custom FreeMarker template?)');
}

// Read the body raw (any content type) and authenticate before parsing it.
app.post('/webhooks/amplitude', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyAmplitudeRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
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
    console.error('Error handling Amplitude payload:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAmplitudeRequest = verifyAmplitudeRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/amplitude`);
  });
}
