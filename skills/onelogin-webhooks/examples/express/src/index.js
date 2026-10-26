// Generated with: onelogin-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Checks lengths first (timingSafeEqual throws on
 * unequal lengths), then compares equal-length Buffers.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * OneLogin does not sign Event Broadcaster requests. You add a custom header (any name,
 * any value) to the broadcaster and compare it with the value you stored. The WHOLE
 * header value is compared: a "Bearer " prefix is not stripped or parsed.
 * This is a static shared credential: it authenticates the sender, not the body, and
 * gives no replay protection. Use HTTPS and rotate it if it leaks.
 */
function verifyOneLoginRequest(
  headers,
  secret = process.env.ONELOGIN_WEBHOOK_SECRET,
  headerName = process.env.ONELOGIN_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[String(headerName).toLowerCase()]; // Node lower-cases header names
  return typeof received === 'string' && received.length > 0 && safeEqual(received, secret);
}

/**
 * The body is a JSON array of events (the JSON Array format type OneLogin recommends; its docs
 * describe no other). Returns an array of event objects, or null if the body isn't valid.
 */
function parseEvents(raw) {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.every(isObject) ? parsed : null;
    return isObject(parsed) ? [parsed] : null;
  } catch {
    return null;
  }
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function handleEvent(event) {
  // The broadcaster sends every event type on the account: filter by event_type_id.
  switch (Number(event.event_type_id)) {
    case 5:
      console.log(`User login success: ${event.user_name} (${event.user_id}) from ${event.ipaddr}`);
      // TODO: check event.risk_score and flag risky logins
      break;

    case 6:
      console.log(`User login failed: ${event.user_name || event.login_name} from ${event.ipaddr}`);
      // TODO: count failures and alert on brute force
      break;

    case 7:
      console.log(`User logout: ${event.user_name} (${event.user_id})`);
      // TODO: end the matching session in your app
      break;

    case 8:
      console.log(`User logged into an app: ${event.user_name} -> ${event.app_name}`);
      // TODO: record app access
      break;

    case 11:
      console.log(`User changed password: ${event.user_name} (${event.user_id})`);
      // TODO: revoke other sessions or notify the user
      break;

    case 22:
      console.log(`User added an MFA device: ${event.user_name} (${event.otp_device_name})`);
      // TODO: audit the new factor
      break;

    default:
      console.log(`Unhandled event_type_id: ${event.event_type_id}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/onelogin', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyOneLoginRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const events = parseEvents(raw);
  if (!events) {
    return res.status(400).json({ error: 'Expected a JSON array of events' });
  }

  try {
    for (const event of events) handleEvent(event);
  } catch (err) {
    // Non-200 makes OneLogin retry (up to 3 attempts in total).
    console.error('Error handling OneLogin events:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // OneLogin requires HTTP 200; anything else (or a timeout) triggers a retry.
  res.status(200).json({ received: events.length });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyOneLoginRequest = verifyOneLoginRequest;
module.exports.parseEvents = parseEvents;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/onelogin`);
  });
}
