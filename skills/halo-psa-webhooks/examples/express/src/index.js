// Generated with: halo-psa-webhooks skill
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

// Strict base64: only the standard alphabet, padding only at the end.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Parse `Authorization: Basic base64(username:password)`. The scheme is case-insensitive.
 * Anything that isn't strictly valid (junk after the credentials, characters outside the
 * base64 alphabet, bad padding, invalid UTF-8, no colon) returns null. Splits on the FIRST
 * colon, so the password may contain colons.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = header.match(/^basic +(\S+)$/i);
  if (!match) return null;
  const encoded = match[1];
  if (encoded.length % 4 !== 0 || !BASE64_RE.test(encoded)) return null;

  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(encoded, 'base64'));
  } catch {
    return null;
  }
  const sep = decoded.indexOf(':');
  if (sep === -1) return null;
  return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
}

/**
 * HaloPSA webhooks are not signed. With "Basic Authentication" chosen on the webhook, every
 * request carries `Authorization: Basic base64(username:password)`. The credentials must
 * arrive on the first request: Hookdeck never answers with a 401 + WWW-Authenticate challenge.
 */
function verifyHaloPsaRequest(headers, config = process.env) {
  const username = config.HALO_PSA_WEBHOOK_USERNAME;
  const password = config.HALO_PSA_WEBHOOK_PASSWORD;
  if (!username || !password) return false; // never accept when unconfigured

  const credentials = parseBasicAuth(headers['authorization']);
  if (!credentials) return false;

  // Evaluate both comparisons before deciding (no short-circuit on the username).
  const usernameOk = safeEqual(credentials.username, username);
  const passwordOk = safeEqual(credentials.password, password);
  return usernameOk && passwordOk;
}

/**
 * Halo's docs don't name the event-name or object-id properties in text, so these field
 * names are illustrative: check a real delivery in Halo's Deliveries tab or Hookdeck.
 */
function pick(payload, ...names) {
  for (const name of names) {
    if (payload[name] !== undefined) return payload[name];
  }
  return undefined;
}

function handleEvent(payload) {
  const event = pick(payload, 'event', 'eventName', 'event_name');
  const objectId = pick(payload, 'object_id', 'objectId');

  switch (event) {
    case 'New Ticket Logged':
      console.log(`New ticket logged: ${objectId}`);
      // TODO: create the ticket in your system
      break;

    case 'Ticket Reassigned':
      console.log(`Ticket reassigned: ${objectId}`);
      // TODO: notify the new assignee
      break;

    case 'Document deleted on a Ticket':
    case 'Document edited on a Ticket':
      console.log(`${event}: ${objectId}`);
      // TODO: refresh the ticket's attachments
      break;

    default:
      console.log(`Unhandled event: ${event} (object: ${objectId})`);
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Read the body raw (any content type) so the request is authenticated before anything is parsed.
app.post('/webhooks/halo-psa', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyHaloPsaRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credentials' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // With batching enabled Halo sends a JSON array of objects instead of one object.
  const events = Array.isArray(payload) ? payload : [payload];
  if (!events.every(isObject)) {
    return res.status(400).json({ error: 'Expected a JSON object or an array of objects' });
  }

  try {
    events.forEach(handleEvent);
  } catch (err) {
    console.error('Error handling HaloPSA event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyHaloPsaRequest = verifyHaloPsaRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/halo-psa`);
  });
}
