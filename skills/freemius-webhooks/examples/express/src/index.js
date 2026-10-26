// Generated with: freemius-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Freemius webhook signature.
 *
 * Freemius sends `x-signature: <hex>`: the bare hex HMAC-SHA256 of the raw request
 * body, keyed with the product's secret key (UTF-8 bytes, used as-is). No prefix,
 * no timestamp.
 */
function verifyFreemiusSignature(rawBody, signature, secret) {
  // Check the shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Handle a verified event. The delivered payload has the same schema as Freemius's
 * API event resource, with the event name in the top-level `type`.
 */
function handleEvent(event) {
  // Only touch nested fields after checking their type: the body is untrusted input
  const id = typeof event.id === 'string' || typeof event.id === 'number' ? event.id : '(no id)';
  const objects = isObject(event.objects) ? Object.keys(event.objects) : [];

  switch (event.type) {
    case 'license.activated':
    case 'license.created':
      console.log(`License event ${event.type} (${id}); objects: ${objects.join(', ') || 'none'}`);
      // TODO: Provision or unlock the product for this license
      break;
    case 'license.cancelled':
      console.log(`License cancelled (${id})`);
      // TODO: Revoke access
      break;
    case 'subscription.created':
    case 'subscription.cancelled':
      console.log(`Subscription event ${event.type} (${id})`);
      // TODO: Sync subscription state
      break;
    case 'payment.created':
    case 'payment.refund':
      console.log(`Payment event ${event.type} (${id})`);
      // TODO: Record the payment or refund
      break;
    case 'user.created':
      console.log(`New user (${id})`);
      // TODO: Create the customer record
      break;
    default:
      // Freemius lists ~150 event types and may add more at any time: log and acknowledge
      console.log(`Unhandled Freemius event type: ${event.type}`);
  }
}

// Read the raw body for ANY content type so the signature is checked on the exact bytes.
app.post('/webhooks/freemius', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.FREEMIUS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FREEMIUS_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyFreemiusSignature(rawBody, req.headers['x-signature'], secret)) {
    console.error('Freemius webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after the signature check
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(event) || typeof event.type !== 'string') {
    return res.status(400).send('Missing event type');
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Freemius webhook:', err);
    return res.status(500).send('Internal error');
  }

  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`Freemius webhook server listening on port ${port}`));
}

module.exports = { app, verifyFreemiusSignature, handleEvent };
