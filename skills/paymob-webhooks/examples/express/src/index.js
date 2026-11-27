// Generated with: paymob-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// The keys Paymob signs, in the documented order, per callback `type`.
// TRANSACTION: https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback
// TOKEN: https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-for-card-tokens
const HMAC_FIELDS = {
  TRANSACTION: [
    'amount_cents',
    'created_at',
    'currency',
    'error_occured',
    'has_parent_transaction',
    'id',
    'integration_id',
    'is_3d_secure',
    'is_auth',
    'is_capture',
    'is_refunded',
    'is_standalone_payment',
    'is_voided',
    'order.id',
    'owner',
    'pending',
    'source_data.pan',
    'source_data.sub_type',
    'source_data.type',
    'success',
  ],
  TOKEN: [
    'card_subtype',
    'created_at',
    'email',
    'id',
    'masked_pan',
    'merchant_id',
    'order_id',
    'token',
  ],
};

function getPath(obj, path) {
  return path.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

/**
 * Build the string Paymob signs for a callback: the values of the keys for its
 * `type`, read from `obj`, joined in order with no separator. String() renders
 * booleans as "true"/"false" and numbers as their digits, as the docs' worked
 * examples do.
 *
 * @param {string} type - The callback's `type` ("TRANSACTION" or "TOKEN")
 * @param {object} obj - The callback's `obj`
 * @returns {string|null} null for a type with no documented key list
 */
function buildSignedString(type, obj) {
  const fields = HMAC_FIELDS[type];
  if (!fields) return null;
  return fields
    .map((field) => {
      const value = getPath(obj, field);
      return value === undefined || value === null ? '' : String(value);
    })
    .join('');
}

/**
 * Verify a Paymob callback. Paymob computes HMAC-SHA512 (hex) over the string
 * above and sends it as the `hmac` query parameter (not a header, not the raw body).
 *
 * @param {object} body - Parsed callback body ({ type, obj })
 * @param {string} hmacParam - Value of the `?hmac=` query parameter
 * @param {string} secret - Paymob HMAC secret
 * @returns {boolean}
 */
function verifyPaymobHmac(body, hmacParam, secret) {
  const signed = buildSignedString(body.type, body.obj || {});
  if (signed === null || !hmacParam || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(signed).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(hmacParam).toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * A transaction's state, from its booleans. Paymob sends no event name for the
 * outcome: success false with pending false is a decline.
 */
function transactionState(obj) {
  if (obj.is_refunded) return 'refunded';
  if (obj.is_voided) return 'voided';
  if (obj.pending) return 'pending';
  if (obj.success && obj.is_auth && !obj.is_capture) return 'authorized';
  if (obj.is_capture) return 'captured';
  if (obj.success) return 'succeeded';
  return 'declined';
}

// Paymob POSTs JSON. Verification needs the parsed fields, so parse first.
app.post('/webhooks/paymob', express.json({ type: '*/*' }), (req, res) => {
  const body = req.body || {};

  if (!body.obj || !HMAC_FIELDS[body.type]) {
    return res.status(400).send('Unexpected callback payload');
  }

  if (!verifyPaymobHmac(body, req.query.hmac, process.env.PAYMOB_HMAC_SECRET)) {
    console.error('Paymob HMAC verification failed');
    return res.status(400).send('Invalid signature');
  }

  const obj = body.obj;

  if (body.type === 'TOKEN') {
    // A customer saved a card. Your code: store obj.token against obj.order_id.
    console.log(`Card token ${obj.id} for order ${obj.order_id}`);
    return res.status(200).send('OK');
  }

  const state = transactionState(obj);
  console.log(`Transaction ${obj.id} (order ${obj.order && obj.order.id}): ${state}`);

  switch (state) {
    case 'succeeded':
      // Your code: mark the order paid, fulfil, send a receipt
      break;
    case 'declined':
      // Your code: tell the customer, release the reservation
      break;
    case 'pending':
      // Your code: wait for a later callback (OTP page, kiosk or cash payment)
      break;
    case 'authorized':
      // Your code: funds held; capture when ready
      break;
    case 'captured':
      // Your code: complete a prior authorization
      break;
    case 'refunded':
      // Your code: reverse fulfilment, credit the customer
      break;
    case 'voided':
      // Your code: cancel an uncaptured authorization
      break;
    default:
      console.log(`Unhandled state for transaction ${obj.id}`);
  }

  // Acknowledge quickly; do slow work in the background.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, HMAC_FIELDS, verifyPaymobHmac, buildSignedString, transactionState };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paymob`);
  });
}
