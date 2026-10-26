// Generated with: felloh-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Felloh sends the bare hex HMAC-SHA256 of the raw request body in X-Signature.
 * The signing key is used as UTF-8 bytes. The format is checked before decoding, because
 * Buffer.from(x, 'hex') silently drops invalid characters.
 */
function verifyFellohSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Felloh has no event-name field or header, so deliveries are told apart by shape.
 * Every field is untrusted: check types before reading into nested objects.
 */
function classify(payload) {
  if (isObject(payload.user)) return 'user-create';
  if (isObject(payload.transaction) && isObject(payload.status)) return 'refund-status';
  if (isObject(payload.transaction) && typeof payload.status === 'string') return 'transaction-status';
  if (isObject(payload.booking) && !('transaction' in payload)) return 'booking';
  return null;
}

function handleEvent(payload) {
  switch (classify(payload)) {
    case 'transaction-status': {
      // Retried up to 5 times about a minute apart, so make this idempotent.
      console.log(`Transaction ${payload.transaction.id} is ${payload.status}`);
      // TODO: update the order or payment for payload.booking?.booking_reference
      break;
    }

    case 'refund-status': {
      console.log(`Refund for transaction ${payload.transaction.id} is ${payload.status.id}`);
      // TODO: update the refund record (payload.authorisation_code, payload.amount)
      break;
    }

    case 'booking': {
      console.log(`Booking ${payload.booking.booking_reference}`);
      // TODO: sync the booking (payload.customer_name, payload.departure_date, payload.return_date)
      break;
    }

    case 'user-create': {
      console.log(`User created: ${payload.user.id}`);
      // TODO: provision or audit the new user (payload.email, payload.organisation)
      break;
    }

    default:
      console.log('Unhandled Felloh delivery');
  }
}

// Read the body raw (any content type) so the exact bytes are verified.
app.post('/webhooks/felloh', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyFellohSignature(rawBody, req.get('x-signature'), process.env.FELLOH_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  // Dashboard test deliveries are signed with the real key and never retried.
  if (req.get('x-felloh-test') === 'true') {
    console.log('Felloh test delivery');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!isObject(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Felloh event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFellohSignature = verifyFellohSignature;
module.exports.classify = classify;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/felloh`);
  });
}
