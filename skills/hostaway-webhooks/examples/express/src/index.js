// Generated with: hostaway-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Hostaway's docs don't name the HTTP method, so accept all the usual ones.
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Constant-time compare: SHA-256 digests are always the same length, so timingSafeEqual never throws. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse 'Authorization: Basic base64(username:password)'. The scheme is case-insensitive,
 * the base64 must be strictly valid (no junk after valid credentials), and the split is on
 * the first colon so the password may contain colons. Returns null when malformed.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return null;
  const encoded = match[1];
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.toString('base64') !== encoded) return null; // not canonical base64
  const text = decoded.toString('utf8');
  const colon = text.indexOf(':');
  if (colon === -1) return null;
  return { username: text.slice(0, colon), password: text.slice(colon + 1) };
}

/**
 * Hostaway does not sign payloads. If you set a login and password on the webhook, Hostaway
 * sends them as HTTP Basic auth. The static credential authenticates the sender, not the body.
 */
function verifyHostawayRequest(
  headers,
  username = process.env.HOSTAWAY_WEBHOOK_USERNAME,
  password = process.env.HOSTAWAY_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}

/**
 * The unified webhook payload isn't documented field by field, so read the event name
 * defensively: `event`, `eventType`, or `object` + `action` (e.g. reservation + created).
 */
function getEventName(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (typeof payload.event === 'string') return payload.event;
  if (typeof payload.eventType === 'string') return payload.eventType;
  if (typeof payload.object === 'string' && typeof payload.action === 'string') {
    return `${payload.object}.${payload.action}`;
  }
  return null;
}

function handleEvent(payload) {
  const event = getEventName(payload);

  switch (event) {
    case 'reservation.created':
      console.log('Reservation created');
      // TODO: sync the new booking (payload.data)
      break;

    case 'reservation.updated':
      console.log('Reservation updated');
      // TODO: update the stored booking
      break;

    case 'message.received':
      console.log('Guest message received');
      // TODO: route the message to your inbox
      break;

    case 'task.created':
      console.log('Task created');
      // TODO: create the matching task
      break;

    case 'task.updated':
      console.log('Task updated');
      // TODO: update the matching task
      break;

    default:
      // Unknown shape: log the top-level keys (not the values) so you can extend this handler.
      console.log(
        `Unhandled event: ${event}`,
        payload && typeof payload === 'object' ? Object.keys(payload) : typeof payload
      );
  }
}

// Read the body raw (any content type) and authenticate before parsing it.
app.all('/webhooks/hostaway', express.raw({ type: '*/*' }), (req, res) => {
  // Check the credential first, for every method.
  if (!verifyHostawayRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      // The body format isn't documented: acknowledge and log rather than reject.
      console.log(`Non-JSON body (${raw.length} chars) on ${req.method}`);
    }
  } else {
    console.log(`Empty body on ${req.method}`);
  }

  if (payload !== null) {
    try {
      handleEvent(payload);
    } catch (err) {
      console.error('Error handling Hostaway event:', err);
      return res.status(500).json({ error: 'Handler error' });
    }
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyHostawayRequest = verifyHostawayRequest;
module.exports.parseBasicAuth = parseBasicAuth;
module.exports.getEventName = getEventName;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: ${ALLOWED_METHODS.join('|')} http://localhost:${PORT}/webhooks/hostaway`);
  });
}
