require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const HEX_128 = /^[0-9a-fA-F]{128}$/;

/**
 * Verify an OxaPay webhook signature.
 *
 * OxaPay sends `HMAC: <hex>` = lowercase hex HMAC-SHA512 of the raw request
 * body, keyed with your merchant API key (payment callbacks) or payout API
 * key (payout callbacks). The key is used as-is, as UTF-8 bytes.
 *
 * @param {Buffer} rawBody - Raw request body bytes, exactly as received
 * @param {string|undefined} signature - HMAC header value
 * @param {string|undefined} secret - Merchant or payout API key
 * @returns {boolean} - Whether the signature is valid
 */
function verifyOxapaySignature(rawBody, signature, secret) {
  if (!signature || !secret || !Buffer.isBuffer(rawBody)) {
    return false;
  }
  // Validate the format first: exactly 128 hex characters (SHA-512)
  if (!HEX_128.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex'); // safe: format validated above

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/**
 * Handle a verified OxaPay callback. There is no event name: each callback is
 * the transaction's current state, so dispatch on `status`.
 * `type` is the flow: invoice, white_label, static_address, payment_link,
 * donation (payments) or payout.
 */
function handleOxapayCallback(event) {
  switch (event.status) {
    case 'Paying':
      console.log(`Payment ${event.track_id} (${event.type}) paying: awaiting network confirmation`);
      // TODO: Mark the order as payment in progress; do NOT deliver goods yet
      break;

    case 'Paid':
      console.log(`Payment ${event.track_id} (${event.type}) paid: ${event.amount} ${event.currency}`);
      // TODO: Fulfil the order (look it up by event.order_id)
      break;

    case 'Confirming':
      console.log(`Payout ${event.track_id} confirming, tx ${event.tx_hash}`);
      // TODO: Mark the payout as sent and awaiting confirmation
      break;

    case 'Confirmed':
      console.log(`Payout ${event.track_id} confirmed, tx ${event.tx_hash}`);
      // TODO: Mark the payout as completed
      break;

    case 'Failed':
      console.log(`Payout ${event.track_id} failed`);
      // TODO: Alert and release or retry the payout
      break;

    default:
      console.log(`Unhandled OxaPay status: ${event.status}`);
  }
}

// OxaPay webhook endpoint - raw body for signature verification, any content type
app.post('/webhooks/oxapay',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.OXAPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('OXAPAY_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifyOxapaySignature(rawBody, req.headers['hmac'], secret)) {
      console.error('OxaPay webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (event === null || typeof event !== 'object') {
      return res.status(400).send('Invalid payload');
    }

    // Retries resend the same callback: de-duplicate on track_id + status.
    handleOxapayCallback(event);

    // OxaPay counts a delivery as successful only with HTTP 200 and body "ok"
    res.status(200).type('text/plain').send('ok');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyOxapaySignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/oxapay`);
  });
}
