// Generated with: roller-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * ROLLER does not sign payloads. It sends the webhook's authentication.apiKey as
 * plain text in the x-roller-apikey header. This authenticates the sender only:
 * there is no timestamp, so no replay protection.
 */
function verifyRollerRequest(headers, apiKey = process.env.ROLLER_WEBHOOK_API_KEY) {
  if (!apiKey) return false; // never accept when unconfigured
  const received = headers['x-roller-apikey'];
  return Boolean(received) && safeEqual(received, apiKey);
}

// ROLLER sends the payload type (`type`: Booking, Customer, Redemption, ...) and the
// action (`eventType`: Created, Updated, Cancelled) as separate fields; it never sends
// a dotted name. Compose them into one key to dispatch on.
function handleEvent(payload) {
  const event = `${payload.type}.${payload.eventType}`;
  switch (event) {
    case 'Booking.Created':
      console.log(`Booking created`);
      // TODO: handle Booking.Created
      break;

    case 'Booking.Updated':
      console.log(`Booking updated`);
      // TODO: handle Booking.Updated
      break;

    case 'Booking.Cancelled':
      console.log(`Booking cancelled`);
      // TODO: handle Booking.Cancelled
      break;

    case 'Customer.Created':
      console.log(`Customer created`);
      // TODO: handle Customer.Created
      break;

    case 'Redemption.Created':
      console.log(`Redemption created`);
      // TODO: handle Redemption.Created
      break;

    case 'PaymentLink.Created':
      console.log(`Payment link created`);
      // TODO: handle PaymentLink.Created
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/roller', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyRollerRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing x-roller-apikey' });
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
    console.error('Error handling ROLLER event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRollerRequest = verifyRollerRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/roller`);
  });
}
