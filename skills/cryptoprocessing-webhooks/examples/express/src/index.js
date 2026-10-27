// Generated with: cryptoprocessing-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNATURE_PATTERN = /^[0-9a-fA-F]{128}$/;

/**
 * Verify a CryptoProcessing callback signature.
 *
 * X-Processing-Signature = lowercase hex HMAC-SHA512 of the raw body, keyed with
 * the secret of the active Master API key (used as UTF-8 bytes). Nothing else is signed.
 *
 * @param {Buffer} rawBody - Raw request body bytes, exactly as received
 * @param {string|undefined} signature - X-Processing-Signature header value
 * @param {string|undefined} secret - Secret key of the active Master API key
 * @returns {boolean} - Whether the signature is valid
 */
function verifyCryptoProcessingSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }
  // Validate length and alphabet before decoding (Buffer.from(hex) drops bad characters)
  if (!SIGNATURE_PATTERN.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');

  // Both are 64 bytes here, so timingSafeEqual cannot throw
  return crypto.timingSafeEqual(received, expected);
}

// Callbacks fire on every status change and failed deliveries are retried, so
// remember what was already handled. Use a database or cache in production.
const seen = new Set();

/**
 * Handle a verified callback, dispatching on the body's `type` field.
 * `status` carries the new state (confirmed, not_confirmed, cancelled, pending, ...).
 */
function handleCallback(event) {
  switch (event.type) {
    case 'deposit':
      console.log(`Deposit ${event.id} ${event.status}: ${event.currency_received?.amount} ${event.currency_received?.currency}`);
      // TODO: Credit the user once status is "confirmed"
      break;

    case 'withdrawal':
      console.log(`Withdrawal ${event.id} ${event.status} (foreign_id ${event.foreign_id})`);
      // TODO: Mark the payout as settled or failed
      break;

    case 'exchange':
      console.log(`Exchange ${event.id} ${event.status}: ${event.currency_sent?.currency} -> ${event.currency_received?.currency}`);
      // TODO: Update the conversion record
      break;

    case 'payment_request':
      console.log(`Payment request ${event.payment_request_id} ${event.status} (foreign_id ${event.foreign_id})`);
      // TODO: Fulfil the order once the request is paid
      break;

    default:
      // deposit_exchange, deposit_wallet_client, withdrawal_exchange,
      // withdrawal_instant, withdrawal_instant_exchange, invoice, and future types
      console.log(`Unhandled CryptoProcessing callback type: ${event.type} (${event.status})`);
  }
}

// CryptoProcessing callback endpoint - raw body for signature verification, any content type
app.post('/webhooks/cryptoprocessing',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.CRYPTOPROCESSING_WEBHOOK_SECRET;
    if (!secret) {
      console.error('CRYPTOPROCESSING_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifyCryptoProcessingSignature(rawBody, req.headers['x-processing-signature'], secret)) {
      console.error('CryptoProcessing signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (!event || typeof event !== 'object') {
      return res.status(400).send('Invalid JSON');
    }

    // A duplicate of an already handled callback: answer 201 to stop its retries
    const key = `${event.type}:${event.id ?? event.payment_request_id}:${event.status}`;
    if (seen.has(key)) {
      return res.status(201).json({ received: true, duplicate: true });
    }

    handleCallback(event);
    seen.add(key);

    // Only HTTP 200 stops delivery
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyCryptoProcessingSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cryptoprocessing`);
  });
}
