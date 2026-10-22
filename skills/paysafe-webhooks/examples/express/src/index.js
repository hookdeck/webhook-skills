require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Paysafe webhook signature.
 * Signature header = base64(HMAC_SHA256(hmacKey, raw JSON body)).
 * The HMAC key is used as a raw UTF-8 string (it is NOT base64-decoded).
 * @param {Buffer|string} rawBody - Raw request body, exactly as received
 * @param {string} signatureHeader - Value of the `Signature` header
 * @param {string} secret - HMAC key from the Business Portal
 * @returns {boolean}
 */
function verifyPaysafeWebhook(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths = invalid
  }
}

// Paysafe webhook endpoint - raw body of any content type is needed for verification
app.post('/webhooks/paysafe',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['signature'];

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).send('Missing request body');
    }

    if (!signature) {
      return res.status(400).send('Missing Signature header');
    }

    if (!verifyPaysafeWebhook(req.body, signature, process.env.PAYSAFE_WEBHOOK_SECRET)) {
      console.error('Paysafe webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    console.log(`Received ${event.eventName} for ${event.resourceId} (attempt ${event.attemptNumber})`);

    switch (event.eventName) {
      case 'PAYMENT_HANDLE_INITIATED':
      case 'PAYMENT_HANDLE_PROCESSING':
      case 'PAYMENT_HANDLE_PAYABLE':
        console.log('Payment handle update:', event.resourceId);
        break;

      case 'PAYMENT_HANDLE_COMPLETED':
        console.log('Payment handle completed:', event.resourceId);
        // TODO: Create the payment using the handle's paymentHandleToken
        break;

      case 'PAYMENT_HANDLE_FAILED':
        console.log('Payment handle failed:', event.resourceId);
        // TODO: Notify the customer, offer another payment method
        break;

      case 'PAYMENT_COMPLETED':
        console.log('Payment completed:', event.resourceId);
        // TODO: Fulfil the order
        break;

      case 'PAYMENT_FAILED':
      case 'PAYMENT_CANCELLED':
        console.log(`Payment ${event.eventName === 'PAYMENT_FAILED' ? 'failed' : 'cancelled'}:`, event.resourceId);
        // TODO: Release inventory, notify the customer
        break;

      case 'PAYMENT_HELD':
        console.log('Payment held for risk review:', event.resourceId);
        break;

      case 'SETTLEMENT_COMPLETED':
        console.log('Settlement completed:', event.resourceId);
        // TODO: Reconcile the settlement
        break;

      case 'SETTLEMENT_FAILED':
        console.log('Settlement failed:', event.resourceId);
        break;

      default:
        console.log(`Unhandled event: ${event.eventName}`);
    }

    // 2xx acknowledges receipt; 4xx/5xx makes Paysafe retry (up to 3 times)
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyPaysafeWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paysafe`);
  });
}
