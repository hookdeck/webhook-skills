// Generated with: the-things-stack-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// The Things Stack doesn't sign webhooks. Checking "Request authentication"
// on the webhook makes the Console store this header, which the Application
// Server sends on every request:
//   Authorization: Basic base64(<username>:<password>)
// (The docs call it "Authentication: Basic"; the Console code sets
// Authorization.) Requests are always POST, with a JSON body.
// ---------------------------------------------------------------------------

/** Constant-time string comparison that doesn't leak the length. */
function safeEqual(given, expected) {
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Check an Authorization header against the configured credentials.
 * @param {string|undefined} authorization - the Authorization header
 * @param {string|undefined} username - TTS_WEBHOOK_USERNAME
 * @param {string|undefined} password - TTS_WEBHOOK_PASSWORD
 * @returns {boolean}
 */
function verifyBasicAuth(authorization, username, password) {
  if (!username || !password) return false;
  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(String(authorization || ''));
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':'); // the password may contain ':'
  if (separator < 0) return false;
  const userOk = safeEqual(decoded.slice(0, separator), username);
  const passOk = safeEqual(decoded.slice(separator + 1), password);
  return userOk && passOk;
}

// Each request carries exactly one of these top-level message objects.
const MESSAGE_TYPES = [
  'uplink_message',
  'uplink_normalized',
  'join_accept',
  'downlink_ack',
  'downlink_nack',
  'downlink_sent',
  'downlink_failed',
  'downlink_queued',
  'downlink_queue_invalidated',
  'location_solved',
  'service_data',
];

/**
 * Every message has end_device_ids, correlation_ids and received_at, plus one
 * message object named after its type. Fields with empty values ("", 0,
 * false) are omitted.
 */
function handleMessage(message) {
  const type = MESSAGE_TYPES.find((name) => message[name] !== undefined) || 'unknown';
  const deviceId = (message.end_device_ids && message.end_device_ids.device_id) || null;
  switch (type) {
    case 'uplink_message': {
      const up = message.uplink_message;
      // decoded_payload is present when a payload formatter is set; frm_payload is base64.
      console.log(`Uplink from ${deviceId} on port ${up.f_port}:`, up.decoded_payload || up.frm_payload);
      break;
    }
    case 'join_accept':
      console.log(`Device ${deviceId} joined`);
      break;
    case 'downlink_ack':
    case 'downlink_nack':
    case 'downlink_sent':
    case 'downlink_failed':
    case 'downlink_queued':
    case 'downlink_queue_invalidated':
      console.log(`${type} for ${deviceId}`);
      break;
    default:
      console.log(`${type} message for ${deviceId}`);
  }
  return { received: true, type, device_id: deviceId };
}

// express.raw() keeps the body as bytes, the same as the signed examples.
app.post('/webhooks/the-things-stack', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const username = process.env.TTS_WEBHOOK_USERNAME;
  const password = process.env.TTS_WEBHOOK_PASSWORD;
  if (!username || !password) {
    console.error('TTS_WEBHOOK_USERNAME and TTS_WEBHOOK_PASSWORD must both be set: rejecting request');
    return res.status(500).json({ error: 'Webhook credentials not configured' });
  }

  if (!verifyBasicAuth(req.get('authorization'), username, password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // X-Downlink-Apikey (when you set a Downlink API key) is an API key that can
  // schedule downlinks: don't log it.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  let message;
  try {
    message = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The Things Stack waits 5 seconds by default: answer quickly, process later.
  return res.status(200).json(handleMessage(message));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`The Things Stack webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/the-things-stack`);
  });
}

module.exports = { app, verifyBasicAuth, handleMessage };
