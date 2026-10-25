// Generated with: timify-webhooks skill
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
 * TIMIFY does not sign payloads. When "Include header name" is enabled on the webhook
 * subscription, every request carries the header name and secret value you chose.
 * Compare the WHOLE header value (no Bearer parsing). The header name is user-chosen.
 * Node lowercases incoming header names, so the lookup is case-insensitive.
 */
function verifyTimifyRequest(
  headers,
  secret = process.env.TIMIFY_WEBHOOK_SECRET,
  headerName = process.env.TIMIFY_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}

// Normalize "Customer Fields" / "customer_fields" / "customerFields" to "customerfields".
const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * TIMIFY's overview page does not document the payload fields, so this dispatch is
 * defensive: it looks for the webhook name and type under a few likely keys and
 * acknowledges anything it doesn't recognise. Adjust to the payloads you actually receive.
 */
function handleEvent(payload) {
  const name = normalize(payload.webhook ?? payload.name ?? payload.resource);
  const type = normalize(payload.type ?? payload.action);
  const label = `${payload.webhook ?? payload.name ?? payload.resource} ${payload.type ?? payload.action}`;

  switch (name) {
    case 'customers':
      console.log(`Customers ${type}: ${label}`);
      // TODO: sync the customer record (payload.data)
      break;

    case 'event':
      console.log(`Event ${type}: ${label}`);
      // TODO: create, update or cancel the booking in your system
      break;

    case 'events':
      console.log(`Events ${type}: ${label}`);
      // TODO: remove the deleted bookings
      break;

    case 'services':
      console.log(`Services ${type}: ${label}`);
      // TODO: sync the service catalogue
      break;

    case 'resource':
      console.log(`Resource ${type}: ${label}`);
      // TODO: sync staff, rooms or equipment
      break;

    case 'company':
      console.log(`Company ${type}: ${label}`);
      // TODO: sync company details
      break;

    case 'manager':
      console.log(`Manager ${type}: ${label}`);
      // TODO: sync manager accounts
      break;

    case 'enterprise':
      console.log(`Enterprise ${type}: ${label}`);
      // TODO: sync enterprise settings
      break;

    case 'customerfields':
      console.log(`Customer Fields ${type}: ${label}`);
      // TODO: sync custom customer field definitions
      break;

    case 'shift':
      console.log(`Shift ${type}: ${label}`);
      // TODO: sync working hours
      break;

    case 'notification':
      console.log(`Notification ${type}: ${label}`);
      // TODO: forward the notification
      break;

    case 'servicegroups':
      console.log(`Service Groups ${type}: ${label}`);
      // TODO: sync service groups
      break;

    default:
      console.log(`Unhandled TIMIFY event: ${label}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/timify', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyTimifyRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing TIMIFY webhook header' });
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
    console.error('Error handling TIMIFY event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTimifyRequest = verifyTimifyRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/timify`);
  });
}
