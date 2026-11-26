// Generated with: customerio-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Customer.io Reporting Webhook signature.
 *
 * Signed string is "v0:<X-CIO-Timestamp>:<raw body>", HMAC-SHA256, hex digest,
 * compared against the X-CIO-Signature header.
 *
 * @param {Buffer|string} rawBody - Raw, unmodified request body
 * @param {string} timestamp - X-CIO-Timestamp header value
 * @param {string} signature - X-CIO-Signature header value (hex)
 * @param {string} signingKey - Customer.io webhook signing key
 * @returns {boolean} Whether the signature is valid
 */
function verifyCustomerIoWebhook(rawBody, timestamp, signature, signingKey) {
  if (!timestamp || !signature) {
    return false;
  }

  // Build "v0:<timestamp>:<raw body>" and HMAC it. Feed the raw body straight
  // into the HMAC so it is never re-encoded.
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(`v0:${timestamp}:`);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');

  // Timing-safe comparison to prevent timing attacks.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false; // length mismatch or non-hex signature
  }
}

// Customer.io webhook endpoint - must use raw body for signature verification
app.post('/webhooks/customerio',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-cio-signature'];
    const timestamp = req.headers['x-cio-timestamp'];

    // Verify webhook signature over the RAW body before parsing
    if (!verifyCustomerIoWebhook(req.body, timestamp, signature, process.env.CUSTOMERIO_WEBHOOK_SIGNING_KEY)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString());
    const { event_id: eventId, metric, data } = payload;
    // Customer.io's docs spell the in-app object type both `in_app` and `in-app`: accept both.
    const objectType = payload.object_type === 'in-app' ? 'in_app' : payload.object_type;
    // cio_subscription_preferences_changed carries the triggering channel in object_type,
    // so route it on metric alone.
    const route = metric === 'cio_subscription_preferences_changed' ? 'preferences' : objectType;

    // Customer.io has no dotted event name: identify events by object_type + metric.
    console.log(`Received ${objectType}.${metric} event (event_id: ${eventId})`);

    // Your code: de-dupe on event_id before processing (Customer.io retries for 7 days)

    switch (route) {
      case 'preferences':
        console.log(`Subscription preferences changed for customer ${data?.customer_id}`);
        // Your code: sync topic preferences (data.content, when Body content is on)
        break;

      case 'email':
        handleEmailMetric(metric, data);
        break;

      case 'sms':
        console.log(`SMS ${metric} to ${data?.recipient}`);
        // Your code: SMS analytics, two-way messaging, etc.
        break;

      case 'push':
        console.log(`Push ${metric} for customer ${data?.customer_id}`);
        // Your code: push engagement tracking, etc.
        break;

      case 'in_app':
        console.log(`In-app ${metric} for customer ${data?.customer_id}`);
        // Your code: in-app message engagement, etc.
        break;

      case 'customer':
        console.log(`Customer ${data?.customer_id} ${metric}`);
        // Your code: sync subscription state to your database, etc.
        break;

      case 'slack':
      case 'webhook':
      case 'whatsapp':
        console.log(`${objectType} ${metric}`);
        // Your code: channel-specific handling
        break;

      default:
        console.log(`Unhandled object_type: ${objectType} (${metric})`);
    }

    // Return 2xx within 4 seconds to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Handle the metric for an email event (object_type === 'email')
function handleEmailMetric(metric, data) {
  switch (metric) {
    case 'delivered':
      console.log(`Email delivered to ${data?.recipient}`);
      break;
    case 'opened':
      console.log(`Email opened by ${data?.recipient}`);
      break;
    case 'clicked':
      console.log(`Email link clicked: ${data?.href} (link_id: ${data?.link_id})`);
      break;
    case 'bounced':
      console.log(`Email bounced for ${data?.recipient}: ${data?.failure_message}`);
      // Your code: suppress the address, alert, etc.
      break;
    case 'spammed':
      console.log(`Email marked as spam by ${data?.recipient}`);
      break;
    case 'converted':
      console.log(`Email conversion for customer ${data?.customer_id}`);
      break;
    default:
      console.log(`Email ${metric} for ${data?.recipient}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyCustomerIoWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/customerio`);
  });
}
