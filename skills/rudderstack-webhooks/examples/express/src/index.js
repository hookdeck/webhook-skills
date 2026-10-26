// Generated with: rudderstack-webhooks skill
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
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse `Authorization: Basic base64(username:password)`. The scheme is case-insensitive
 * and the credentials are split on the FIRST colon, so the password may contain colons.
 */
function parseBasicAuth(header) {
  if (!header) return null;
  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/**
 * RudderStack does not sign payloads. The HTTP Webhook destination sends the Basic Auth
 * credentials you configured. Both values are compared (no short-circuit) before deciding.
 */
function verifyRudderstackRequest(headers, config = process.env) {
  const expectedUser = config.RUDDERSTACK_WEBHOOK_USERNAME;
  const expectedPass = config.RUDDERSTACK_WEBHOOK_PASSWORD;
  if (!expectedUser || !expectedPass) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers['authorization']);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, expectedUser);
  const passOk = safeEqual(creds.password, expectedPass);
  return userOk && passOk;
}

function handleEvent(event) {
  switch (event.type) {
    case 'track':
      console.log(`Track: ${event.event} (user ${event.userId || event.anonymousId})`);
      // TODO: handle the tracked event (event.event, event.properties)
      break;

    case 'identify':
      console.log(`Identify: user ${event.userId || event.anonymousId}`);
      // TODO: sync event.traits to your user store
      break;

    case 'page':
      console.log(`Page: ${event.name || event.properties?.url}`);
      // TODO: record the page view
      break;

    case 'screen':
      console.log(`Screen: ${event.name}`);
      // TODO: record the screen view
      break;

    case 'group':
      console.log(`Group: ${event.groupId}`);
      // TODO: sync event.traits to your account/group store
      break;

    case 'alias':
      console.log(`Alias: ${event.previousId} -> ${event.userId}`);
      // TODO: merge the two identities
      break;

    default:
      // Mappings can emit any shape, and warehouse sources send other message types.
      console.log(`Unhandled RudderStack payload (type: ${event.type})`);
  }
}

const METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];

// The HTTP method is chosen in the destination settings, so accept all of them.
// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/rudderstack', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.includes(req.method)) {
    res.set('Allow', METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyRudderstackRequest(req.headers)) {
    res.set('WWW-Authenticate', 'Basic realm="rudderstack"');
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let events = [];

  // An empty body (e.g. GET) is valid: nothing to process.
  if (raw.trim() !== '') {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    // Batching sends a JSON array of events.
    events = Array.isArray(payload) ? payload : [payload];
    if (!events.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
      return res.status(400).json({ error: 'Expected a JSON object or an array of objects' });
    }
  }

  try {
    events.forEach(handleEvent);
  } catch (err) {
    console.error('Error handling RudderStack event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true, events: events.length });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRudderstackRequest = verifyRudderstackRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/rudderstack`);
  });
}
