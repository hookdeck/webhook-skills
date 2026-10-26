// Generated with: pingone-webhooks skill
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
 * PingOne does not sign subscription webhooks. It sends the headers you set on the
 * subscription (httpEndpoint.headers). Compare the WHOLE header value with the
 * expected one: no Bearer/Basic parsing, because the value is whatever the admin typed.
 * Node lowercases incoming header names, so the lookup is case-insensitive.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifyPingOneRequest(headers, config = process.env) {
  const secret = config.PINGONE_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const headerName = (config.PINGONE_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[headerName];
  if (typeof received !== 'string' || received === '') return false;
  return safeEqual(received, secret);
}

/**
 * ACTIVITY format bodies arrive as a JSON array (JSON_ARRAY, up to 500 events) or as
 * newline-delimited JSON (ND_JSON, one event per line). Returns an array of events.
 */
function parseEvents(raw) {
  const text = raw.trim();
  if (!text) throw new Error('Empty body');
  let parsed;
  try {
    parsed = JSON.parse(text); // JSON_ARRAY, or ND_JSON with a single line
  } catch {
    parsed = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line)); // ND_JSON
  }
  const events = Array.isArray(parsed) ? parsed : [parsed];
  if (!events.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
    throw new Error('Expected audit event objects');
  }
  return events;
}

/**
 * Each audit event has an `action.type` such as USER.CREATED. PingOne defines many more
 * (see the Audit Reporting Events reference); subscribe only to the ones you handle.
 */
function handleEvent(event) {
  const type = event.action && event.action.type;
  const actor = event.actors && event.actors.user && event.actors.user.name;

  switch (type) {
    case 'USER.CREATED':
      console.log(`User created (event ${event.id})`);
      // TODO: provision the user in your system
      break;

    case 'USER.UPDATED':
      console.log(`User updated (event ${event.id})`);
      // TODO: sync the changed attributes
      break;

    case 'USER.DELETED':
      console.log(`User deleted (event ${event.id})`);
      // TODO: deprovision the user
      break;

    case 'AUTHENTICATION.CREATED':
      console.log(`Authentication recorded for ${actor || 'unknown actor'} (event ${event.id})`);
      // TODO: record the sign-in
      break;

    case 'PASSWORD.RESET':
      console.log(`Password reset (event ${event.id})`);
      // TODO: notify the user
      break;

    default:
      console.log(`Unhandled event: ${type} (id: ${event.id})`);
  }
}

// Read the body raw (any content type) so the request is authenticated before anything is parsed.
app.post('/webhooks/pingone', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPingOneRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credentials' });
  }

  let events;
  try {
    events = parseEvents(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  } catch {
    return res.status(400).json({ error: 'Invalid body: expected a JSON array or ND_JSON of events' });
  }

  try {
    events.forEach(handleEvent);
  } catch (err) {
    console.error('Error handling PingOne event:', err);
    // PingOne retries the same events until it gets a 200.
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: events.length });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPingOneRequest = verifyPingOneRequest;
module.exports.parseEvents = parseEvents;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pingone`);
  });
}
