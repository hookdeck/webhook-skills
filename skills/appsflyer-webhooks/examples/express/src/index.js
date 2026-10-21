// Generated with: appsflyer-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * APPSFLYER PUSH API AUTHENTICATION
 *
 * AppsFlyer does NOT sign payloads: no signature header, no HMAC, no timestamp.
 * You configure a custom authorization header (name + token) per app ID, and
 * AppsFlyer sends it on every request. Compare the full value in constant time.
 */

/** Name of the header you configured in AppsFlyer (HTTP names are case-insensitive). */
function headerName(env = process.env) {
  return (env.APPSFLYER_AUTH_HEADER_NAME || 'authorization').toLowerCase();
}

/**
 * Constant-time compare of the received header value to the expected token.
 *
 * @param {string|undefined} received
 * @param {string|undefined} expected
 * @returns {boolean}
 */
function verifyAppsflyerToken(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(String(received), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The AppsFlyer event name lives in the record's `event_name` field. */
function eventName(payload) {
  return payload && typeof payload.event_name === 'string' ? payload.event_name : 'unknown';
}

/** No unique event ID exists: build an idempotency key from the record. */
function idempotencyKey(payload) {
  return [payload?.appsflyer_id, payload?.event_name, payload?.event_time].join('|');
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * AppsFlyer Push API endpoint (configure the POST method).
 *
 * There is no body signature, so the raw body isn't needed for verification.
 * express.raw() is still used so we authenticate BEFORE parsing, and can return
 * a clean 400 on malformed JSON.
 */
app.post('/webhooks/appsflyer', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.APPSFLYER_AUTH_TOKEN;

  // Fail closed on misconfiguration: 500, distinguishable from a bad credential.
  if (!expected) {
    console.error('APPSFLYER_AUTH_TOKEN is not set — refusing unauthenticated webhooks');
    return res.status(500).json({ error: 'Webhook authentication not configured' });
  }

  const received = req.headers[headerName()];
  if (!received) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  if (!verifyAppsflyerToken(received, expected)) {
    console.error('AppsFlyer authorization header mismatch');
    return res.status(401).json({ error: 'Invalid authorization header' });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.log(`✓ Authenticated AppsFlyer record: ${eventName(payload)}`);

  handleEvent(payload);

  res.status(200).json({ received: true });
});

function handleEvent(payload) {
  // TODO: check idempotencyKey(payload) against your store and return if seen.
  switch (eventName(payload)) {
    case 'install':
      console.log(`📲 Install ${payload.appsflyer_id} for app ${payload.app_id}`);
      break;
    case 'af_purchase':
      console.log(`💰 Purchase from ${payload.appsflyer_id} at ${payload.event_time}`);
      break;
    case 'af_complete_registration':
      console.log(`📝 Registration from ${payload.appsflyer_id}`);
      break;
    default:
      // In-app event names are defined by your app.
      console.log(`In-app event ${eventName(payload)} from ${payload.appsflyer_id}`);
  }
}

module.exports = { app, headerName, verifyAppsflyerToken, eventName, idempotencyKey };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AppsFlyer webhook server listening on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/appsflyer`);
  });
}
