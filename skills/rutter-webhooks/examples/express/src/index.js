require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Rutter webhook signature.
 * X-Rutter-Signature(s) = "sha256=" + base64(HMAC-SHA256(rawBody, clientSecret)).
 * X-Rutter-Signatures lists every active signature (two during secret rotation),
 * so accept if any computed signature matches any received entry.
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signaturesHeader - X-Rutter-Signatures (or X-Rutter-Signature) value
 * @param {string[]} secrets - Active client secrets
 * @returns {boolean}
 */
function verifyRutterWebhook(rawBody, signaturesHeader, secrets) {
  if (!signaturesHeader) return false;
  const received = signaturesHeader.split(',').map((s) => s.trim());

  return secrets.filter(Boolean).some((secret) => {
    const expected =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

    return received.some((sig) => {
      try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch {
        return false; // different lengths = invalid
      }
    });
  });
}

function activeSecrets() {
  return [process.env.RUTTER_CLIENT_SECRET, process.env.RUTTER_CLIENT_SECRET_PREVIOUS];
}

// Rutter webhook endpoint - must use raw body for signature verification
app.post('/webhooks/rutter',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signatures = req.headers['x-rutter-signatures'] || req.headers['x-rutter-signature'];

    // Verify webhook signature
    if (!signatures || !verifyRutterWebhook(req.body, signatures, activeSecrets())) {
      console.error('Rutter webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload after verification
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    console.log(`Received ${event.type} ${event.code} for connection ${event.connection_id}`);

    // Handle the event based on code
    switch (event.code) {
      case 'INITIAL_UPDATE':
        console.log('Initial data download complete:', event.connection_id);
        // TODO: Start fetching merchant data for this connection
        break;

      case 'CONNECTION_NEEDS_UPDATE':
        console.log('Connection needs re-authentication:', event.update_url);
        // TODO: Send event.update_url to the merchant
        break;

      case 'CONNECTION_DISABLED':
        console.log('Connection disabled:', event.disable_error);
        // TODO: Alert the merchant, check connection status
        break;

      case 'ORDER_CREATED':
        console.log('New order:', event.order && event.order.id);
        // TODO: Sync new order, trigger fulfillment, etc.
        break;

      case 'ORDER_UPDATED':
        console.log('Order updated:', event.order && event.order.id);
        // TODO: Update stored order
        break;

      case 'ORDER_DELETED':
        console.log('Order deleted:', event.order && event.order.id);
        // TODO: Remove stored order
        break;

      case 'INVOICE_CREATED':
        console.log('New invoice:', event.invoice && event.invoice.id);
        // TODO: Reconcile invoice
        break;

      case 'INVOICE_UPDATED':
        console.log('Invoice updated:', event.invoice && event.invoice.id);
        // TODO: Update ledger sync
        break;

      default:
        console.log(`Unhandled event: ${event.type} ${event.code}`);
    }

    // Return 2xx within 5 seconds to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyRutterWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/rutter`);
  });
}
