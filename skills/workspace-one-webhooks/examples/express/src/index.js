// Generated with: workspace-one-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Workspace ONE UEM does not sign event notifications. It sends the User Name and
 * Password from the Event Notifications rule as HTTP Basic auth:
 *   Authorization: Basic base64(username:password)
 * The credentials must be on the first request; a 401 + WWW-Authenticate challenge
 * flow won't work (Hookdeck verifies the request as received).
 */
function verifyWorkspaceOneRequest(
  headers,
  username = process.env.WORKSPACE_ONE_WEBHOOK_USERNAME,
  password = process.env.WORKSPACE_ONE_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured

  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec((headers.authorization || '').trim());
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':'); // split on the FIRST colon; passwords may contain ':'
  if (colon === -1) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, colon), username);
  const passOk = safeEqual(decoded.slice(colon + 1), password);
  return userOk && passOk;
}

/**
 * The page documents the event labels but no payload. JSON bodies in these examples
 * use an illustrative shape ({ "EventType": "Device Enrollment", "DeviceId": 123,
 * "EnrollmentUserName": "jdoe" }); XML bodies are accepted and EventType is read
 * from the <EventType> element. Confirm the real EventType strings from a captured delivery.
 */
function parseBody(raw) {
  const text = raw.trim();
  if (text.startsWith('<')) {
    const m = /<EventType>\s*([^<]*?)\s*<\/EventType>/.exec(text);
    return { format: 'xml', payload: { EventType: m ? m[1] : undefined }, raw: text };
  }
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Expected a JSON object');
  }
  return { format: 'json', payload, raw: text };
}

// Lowercase letters and digits only, so "Check-in/Check-out" and "check in check out" match.
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const HANDLERS = {
  'Check-in/Check-out': (p) => console.log(`Multi-user device check-in/out: ${p.DeviceId}`),
  'Device Attribute Change': (p) => console.log(`Device attribute changed: ${p.DeviceId}`),
  'Device Compliance Status Change': (p) => console.log(`Compliance status changed: ${p.DeviceId}`),
  'Device Compromised Status Change': (p) => console.log(`Compromised status changed: ${p.DeviceId}`),
  'Device Delete': (p) => console.log(`Device deleted: ${p.DeviceId}`),
  'Device Enrollment': (p) => console.log(`Device enrolled: ${p.DeviceId} (${p.EnrollmentUserName})`),
  'Device Unenrolled Enterprise Wipe': (p) => console.log(`Enterprise wipe: ${p.DeviceId}`),
  'Device Wipe': (p) => console.log(`Device wiped: ${p.DeviceId}`),
};

const BY_KEY = Object.fromEntries(Object.entries(HANDLERS).map(([k, fn]) => [normalize(k), fn]));

function handleEvent(payload) {
  const handler = BY_KEY[normalize(payload.EventType)];
  if (handler) handler(payload);
  else console.log(`Unhandled event: ${payload.EventType}`);
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/workspace-one', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyWorkspaceOneRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  let parsed;
  try {
    parsed = parseBody(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  } catch {
    return res.status(400).json({ error: 'Body must be a JSON object or XML' });
  }

  try {
    handleEvent(parsed.payload);
  } catch (err) {
    console.error('Error handling Workspace ONE event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyWorkspaceOneRequest = verifyWorkspaceOneRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/workspace-one`);
  });
}
