// Generated with: faundit-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Faundit webhook signature (current v1 scheme).
 *
 * Faundit signs "v1:<timestamp>:<body>" with HMAC-SHA256 (hex) and sends the
 * result in the X-Faundit-Signature-Next header. The timestamp is the value of
 * the X-Faundit-Timestamp header, and body is the raw, unparsed request body.
 *
 * @param {Buffer|string} rawBody - Raw request body (before JSON.parse)
 * @param {string} timestamp - X-Faundit-Timestamp header value
 * @param {string} signatureNext - X-Faundit-Signature-Next header value
 * @param {string} secret - Faundit webhook signing secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyFaunditWebhook(rawBody, timestamp, signatureNext, secret) {
  if (!signatureNext || !timestamp) {
    return false;
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const signedContent = `v1:${timestamp}:${body}`;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch, so guard it.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureNext, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// Faundit webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/faundit',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const timestamp = req.headers['x-faundit-timestamp'];
    // Prefer the current v1 header (X-Faundit-Signature-Next). The deprecated
    // v0 header (X-Faundit-Signature) signs only the timestamp and is not used.
    const signatureNext = req.headers['x-faundit-signature-next'];

    // Verify webhook signature over the raw body
    if (!verifyFaunditWebhook(req.body, timestamp, signatureNext, process.env.FAUNDIT_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    const payload = JSON.parse(req.body.toString());
    const eventType = payload['event-type'];
    const data = payload.data || {};

    console.log(`Received ${eventType} event (id: ${data.id}, location: ${data.locationID})`);

    // Handle the event based on its type. The granular status is data.status.
    switch (eventType) {
      case 'item-status':
        handleItemStatus(data);
        break;

      case 'request-status':
        handleRequestStatus(data);
        break;

      default:
        console.log(`Unhandled event-type: ${eventType}`);
    }

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

/**
 * Handle an item-status event. data.status is one of:
 * contact-missing, waiting-response, wrong-owner, pickup-by-guest, left-behind,
 * finished, shipment-paid, pickup-scheduled, in-route, delivered, deleted,
 * expired, anonymized
 */
function handleItemStatus(data) {
  switch (data.status) {
    case 'pickup-scheduled':
      console.log(`Item ${data.id} pickup scheduled`);
      // Your code: notify the owner, prepare fulfillment
      break;
    case 'in-route':
      console.log(`Item ${data.id} is in route`);
      // Your code: update tracking
      break;
    case 'delivered':
      console.log(`Item ${data.id} delivered`);
      // Your code: close the case with the owner
      break;
    case 'finished':
      console.log(`Item ${data.id} finished`);
      break;
    case 'expired':
      console.log(`Item ${data.id} expired`);
      break;
    default:
      console.log(`Item ${data.id} status: ${data.status}`);
  }
}

/**
 * Handle a request-status event. data.status is one of:
 * registered, awaiting-guest-response, not-found, resolved, deleted,
 * expired, anonymized
 */
function handleRequestStatus(data) {
  switch (data.status) {
    case 'registered':
      console.log(`Request ${data.id} registered`);
      // Your code: acknowledge the lost-item claim
      break;
    case 'resolved':
      console.log(`Request ${data.id} resolved`);
      // Your code: notify the customer their item was matched
      break;
    case 'not-found':
      console.log(`Request ${data.id} not found`);
      break;
    case 'expired':
      console.log(`Request ${data.id} expired`);
      break;
    default:
      console.log(`Request ${data.id} status: ${data.status}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyFaunditWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/faundit`);
  });
}
