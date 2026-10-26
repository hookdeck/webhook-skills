// Generated with: zoop-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the value's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Zoop does not sign payloads. It sends back, verbatim in the Authorization header, the
 * "authorization" string you set when creating the webhook. Compare the whole header value;
 * don't strip or parse any prefix. A static credential authenticates the sender only: it
 * gives no replay protection, so use HTTPS and rotate the value if it leaks.
 */
function verifyZoopRequest(headers, config = process.env) {
  const expected = config.ZOOP_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

// Event ids already processed. Use a durable store (Redis, a database unique key) in production.
const seen = new Set();

function resetSeen() {
  seen.clear();
}

/** Dispatch on event.type. Returns what happened, which is handy for tests. */
function processEvent(event) {
  if (event.id) {
    if (seen.has(event.id)) return 'duplicate';
    seen.add(event.id);
  }

  const object = event.payload && event.payload.object;

  switch (event.type) {
    case 'ping':
      // Sent once when the webhook is created; a 200 activates the webhook.
      console.log('Zoop ping received');
      break;

    case 'transaction.succeeded':
      console.log(`Transaction ${object && object.id} succeeded`);
      // TODO: mark the order as paid and fulfil it
      break;

    case 'transaction.failed':
      console.log(`Transaction ${object && object.id} failed`);
      // TODO: notify the buyer or retry the payment
      break;

    case 'transaction.canceled':
      console.log(`Transaction ${object && object.id} canceled`);
      // TODO: release stock
      break;

    case 'seller.activated':
      console.log(`Seller ${object && object.id} activated`);
      // TODO: enable payouts for the seller
      break;

    case 'bank_account.associated':
      console.log(`Bank account ${object && object.id} associated`);
      // TODO: mark the seller's payout details as ready
      break;

    default:
      console.log(`Unhandled Zoop event type: ${event.type}`);
  }
  return event.type;
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Zoop uses. POST only.
app.post('/webhooks/zoop', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyZoopRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let event;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
    return res.status(400).json({ error: 'Expected an event object with a type' });
  }

  // Zoop waits 1 second for a response and retries after 10 minutes: acknowledge first,
  // then process. In production, push the event onto a queue here instead.
  res.status(200).json({ received: true });

  setImmediate(() => {
    try {
      processEvent(event);
    } catch (err) {
      console.error('Error handling Zoop webhook:', err);
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyZoopRequest = verifyZoopRequest;
module.exports.processEvent = processEvent;
module.exports.resetSeen = resetSeen;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/zoop`);
  });
}
