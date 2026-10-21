require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Fivetran webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Fivetran-Signature-256 header value
 * @param {string} secret - Secret passed when creating the webhook
 * @returns {boolean} - Whether signature is valid
 */
function verifyFivetranWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  // HMAC-SHA256 of the raw body, hex encoded. Fivetran's own example compares
  // uppercase hex, so normalise both sides to compare case-insensitively.
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
    .toUpperCase();
  const actual = signatureHeader.trim().toUpperCase();

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false; // Different lengths = invalid
  }
}

// Fivetran webhook endpoint - must use raw body for signature verification
app.post('/webhooks/fivetran',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.FIVETRAN_WEBHOOK_SECRET;
    if (!secret) {
      console.error('FIVETRAN_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-fivetran-signature-256'];
    if (!signature) {
      return res.status(400).send('Missing X-Fivetran-Signature-256 header');
    }

    if (!verifyFivetranWebhook(req.body, signature, secret)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The event type is in the body, not a header
    const { event, connector_id: connectorId, data = {} } = payload;
    console.log(`Received ${event} event (connector: ${connectorId})`);

    switch (event) {
      case 'sync_start':
        console.log(`Sync started for ${connectorId} (sync ${payload.sync_id})`);
        // TODO: Mark pipeline as running
        break;

      case 'sync_end':
        console.log(`Sync ended for ${connectorId}: ${data.status}`);
        // TODO: Trigger dbt/BI refresh when SUCCESSFUL, alert when FAILED
        break;

      case 'status':
        // Deprecated by Fivetran; prefer sync_start / sync_end
        console.log(`Status event for ${connectorId}`);
        break;

      case 'transformation_start':
        console.log('Transformation run started');
        break;

      case 'transformation_succeeded':
        console.log('Transformation run succeeded');
        // TODO: Trigger downstream jobs
        break;

      case 'transformation_failed':
        console.log('Transformation run failed');
        // TODO: Alert on-call
        break;

      case 'connection_successful':
        console.log(`Connection test passed for ${connectorId}`);
        break;

      case 'connection_failure':
        console.log(`Connection test failed for ${connectorId}`);
        // TODO: Notify the connection owner
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Return 200 within 10 seconds to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyFivetranWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fivetran`);
  });
}
