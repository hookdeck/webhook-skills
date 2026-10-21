require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a MongoDB Atlas alert webhook signature.
 *
 * When a Webhook Secret is set, Atlas sends X-MMS-Signature =
 * base64(HMAC-SHA1(secret, raw request body)). The secret is used as a raw
 * string (not decoded). Without a secret the header is absent.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - X-MMS-Signature header value
 * @param {string|undefined} secret - Webhook Secret from Atlas Webhook Settings
 * @returns {boolean} - Whether the signature is valid
 */
function verifyAtlasSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('base64');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Handle an Atlas alert, dispatching on `eventTypeName`.
 * `status` is OPEN while the alert condition holds and CLOSED when resolved.
 */
function handleAlert(alert) {
  switch (alert.eventTypeName) {
    case 'OUTSIDE_METRIC_THRESHOLD':
      console.log(
        `Metric alert ${alert.id} (${alert.status}): ${alert.metricName} = ` +
        `${alert.currentValue?.number} ${alert.currentValue?.units ?? ''}`
      );
      // TODO: Page on-call, open an incident, or auto-scale on OPEN; resolve on CLOSED
      break;

    case 'HOST_DOWN':
      console.log(`Host down alert ${alert.id} (${alert.status}): ${alert.humanReadable}`);
      // TODO: Notify on-call / trigger failover checks
      break;

    default:
      console.log(`Unhandled Atlas alert ${alert.id}: ${alert.eventTypeName} (${alert.status})`);
  }
}

// Atlas webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/mongodb-atlas',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.MONGODB_ATLAS_WEBHOOK_SECRET;
    if (!secret) {
      console.error('MONGODB_ATLAS_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    // Header is only sent when a Webhook Secret is set in Atlas
    const signature = req.headers['x-mms-signature'];
    if (!signature) {
      return res.status(400).send('Missing X-MMS-Signature header');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyAtlasSignature(rawBody, signature, secret)) {
      console.error('MongoDB Atlas webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let alert;
    try {
      alert = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // X-MMS-Event carries the alert state (alert.open, alert.close, ...)
    console.log(`X-MMS-Event: ${req.headers['x-mms-event']}`);
    // Use alert.id plus status/updated to de-duplicate retried deliveries
    handleAlert(alert);

    // Any 2xx tells Atlas the delivery succeeded
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyAtlasSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mongodb-atlas`);
  });
}
