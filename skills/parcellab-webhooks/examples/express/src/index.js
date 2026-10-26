// Generated with: parcellab-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const CLOUDEVENT_TYPE_PREFIX = 'com.parcellab.tracking.event.';
const EVENTS = [
  'onCreated',
  'onUpdated',
  'onDispatch',
  'onScheduled',
  'onDelay',
  'onInternalDelay',
  'onOutForDelivery',
  'onFailedAttempt',
  'onPickupReady',
  'onDelivered',
  'onReturn',
];
const EVENTS_BY_LOWERCASE = new Map(EVENTS.map((name) => [name.toLowerCase(), name]));

/**
 * Constant-time comparison. Hashing both sides first gives equal-length buffers,
 * so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * parcelLab does not sign payloads. It sends the HTTP Basic credentials you gave it:
 * `Authorization: Basic base64(username:password)`. Split on the FIRST colon (the
 * password may contain colons), then compare username and password each in constant
 * time. Both comparisons run before the decision, so there is no short-circuit.
 */
function verifyParcellabRequest(headers, config = process.env) {
  const username = config.PARCELLAB_WEBHOOK_USERNAME;
  const password = config.PARCELLAB_WEBHOOK_PASSWORD;
  if (!username || !password) return false; // never accept when unconfigured

  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers['authorization'] || '');
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return false;

  const usernameOk = safeEqual(decoded.subarray(0, colon), Buffer.from(username, 'utf8'));
  const passwordOk = safeEqual(decoded.subarray(colon + 1), Buffer.from(password, 'utf8'));
  return usernameOk && passwordOk;
}

/**
 * Native payloads carry `event` (for example onDelivered). In CloudEvents format the
 * `type` is com.parcellab.tracking.event.<lowercased event>, e.g. ...event.ondelivered.
 */
function getEventName(payload) {
  if (typeof payload.event === 'string') return payload.event;
  if (typeof payload.type === 'string' && payload.type.startsWith(CLOUDEVENT_TYPE_PREFIX)) {
    const lowercased = payload.type.slice(CLOUDEVENT_TYPE_PREFIX.length).toLowerCase();
    // Accept the lowercased event name with or without the `on` prefix.
    return EVENTS_BY_LOWERCASE.get(lowercased) || EVENTS_BY_LOWERCASE.get(`on${lowercased}`) || null;
  }
  return null;
}

function handleEvent(payload) {
  const event = getEventName(payload);
  // Native: references at the top level. CloudEvents: nested in `data`.
  const references = payload.references || (payload.data && payload.data.references) || {};
  const tracking = references.tracking_number;

  switch (event) {
    case 'onCreated':
    case 'onUpdated':
      console.log(`Record ${event === 'onCreated' ? 'created' : 'updated'} for ${tracking}`);
      // TODO: sync the order/tracking record
      break;

    case 'onDispatch':
      console.log(`Shipment ${tracking} dispatched`);
      // TODO: mark the order as shipped
      break;

    case 'onScheduled':
      console.log(`Delivery scheduled for ${tracking}`);
      // TODO: store the announced delivery date or time window
      break;

    case 'onOutForDelivery':
      console.log(`Shipment ${tracking} is out for delivery`);
      break;

    case 'onDelay':
    case 'onInternalDelay':
    case 'onFailedAttempt':
      console.log(`Delivery problem (${event}) for ${tracking}`);
      // TODO: alert support or notify the customer
      break;

    case 'onPickupReady':
      console.log(`Shipment ${tracking} is ready for pickup`);
      break;

    case 'onDelivered':
      console.log(`Shipment ${tracking} delivered`);
      // TODO: mark the order as delivered
      break;

    case 'onReturn':
      console.log(`Shipment ${tracking} is being returned to the sender`);
      // TODO: start your returns flow
      break;

    default:
      console.log('Unhandled parcelLab event:', event || '(none)');
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type parcelLab uses (application/json or cloudevents+json).
app.post('/webhooks/parcellab', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyParcellabRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
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
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling parcelLab webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyParcellabRequest = verifyParcellabRequest;
module.exports.getEventName = getEventName;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/parcellab`);
  });
}
