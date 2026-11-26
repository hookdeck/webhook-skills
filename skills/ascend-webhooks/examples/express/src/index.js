require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const webhookSecret = process.env.ASCEND_WEBHOOK_SECRET;

/**
 * Verify an Ascend webhook signature.
 *
 * Ascend sends `X-Ascend-Signature: t=<timestamp>,v1=<hex_hmac_sha256>`.
 * The signed string is `<timestamp>:<rawBody>` (colon separator, RAW body).
 * There is no official Ascend SDK, so we verify manually with `crypto`.
 */
function verifyAscendSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('=').map((s) => s.trim()))
  );
  const { t: timestamp, v1: signature } = parts;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}:${rawBody}`) // colon separator + RAW body
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // hex length mismatch = invalid
  }
}

// Ascend webhook endpoint - must use the RAW body for signature verification.
app.post(
  '/webhooks/ascend',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signatureHeader = req.headers['x-ascend-signature'];

    // req.body is a Buffer here because of express.raw(). Verify against its
    // raw bytes/string before parsing JSON.
    const rawBody = req.body.toString('utf8');

    if (!verifyAscendSignature(rawBody, signatureHeader, webhookSecret)) {
      console.error('Ascend webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Ascend payloads are { id, type, data }. `data` IS the resource object
    // (no Stripe-style `data.object` wrapper).
    switch (event.type) {
      case 'invoice.paid':
        console.log('Invoice paid:', event.data.id, event.data.invoice_number);
        // Your code: Record payment, update billing history, unlock coverage.
        break;

      case 'invoice.voided':
        console.log('Invoice voided:', event.data.id);
        // Your code: Reverse the local billing record.
        break;

      case 'payout.paid':
        console.log('Payout paid:', event.data.id);
        // Your code: Reconcile payouts, update accounting ledger.
        break;

      case 'refund.paid':
        console.log('Refund paid:', event.data.id);
        // Your code: Update policy/billing records, notify the customer.
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return 200 to acknowledge receipt.
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ascend`);
  });
}
