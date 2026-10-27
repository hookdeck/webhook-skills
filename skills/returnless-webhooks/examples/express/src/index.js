require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Returnless webhook signature
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string} signatureHeader - X-Signature header value (bare hex digest)
 * @param {string} secret - The webhook's signing secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyReturnlessWebhook(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') {
    return false;
  }

  // Validate the format before comparing: exactly 64 hex characters.
  // (Buffer.from(sig, 'hex') would silently drop bad characters.)
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHeader)) {
    return false;
  }

  // Lowercase hex HMAC-SHA256 of the raw body, keyed with the secret's UTF-8 bytes
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Equal-length buffers (64 bytes each), compared in constant time
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase()),
    Buffer.from(expected)
  );
}

// Returnless webhook endpoint - must use raw body for signature verification.
// type: '*/*' reads the raw bytes whatever Content-Type the sender uses.
app.post('/webhooks/returnless',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.RETURNLESS_WEBHOOK_SECRET;
    if (!secret) {
      console.error('RETURNLESS_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-signature'];
    if (!signature) {
      return res.status(401).send('Missing X-Signature header');
    }

    if (!Buffer.isBuffer(req.body) || !verifyReturnlessWebhook(req.body, signature, secret)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The event name is in the X-Event-Name header, not the body
    const event = req.headers['x-event-name'];
    const resourceId = payload && payload.data && payload.data.id;
    console.log(`Received ${event} event (${resourceId})`);

    switch (event) {
      case 'request.created':
        console.log(`Return request ${resourceId} submitted`);
        break;

      case 'request.approved':
      case 'request.approved_with_manual_shipment':
      case 'request.approved_without_shipment':
        console.log(`Return request ${resourceId} approved (${event})`);
        // TODO: Notify the customer or create a label
        break;

      case 'request.rejected':
        console.log(`Return request ${resourceId} rejected`);
        break;

      case 'return.created':
        console.log(`Return ${resourceId} created`);
        // TODO: Sync the return to your ERP or OMS
        break;

      case 'return.product.marked_as_received':
        console.log(`Returned product received on ${resourceId}`);
        // TODO: Restock inventory or trigger a refund
        break;

      case 'shipment.delivered':
        console.log(`Shipment ${resourceId} delivered`);
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Return 200 to acknowledge receipt (any 2XX counts as success)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyReturnlessWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/returnless`);
  });
}
