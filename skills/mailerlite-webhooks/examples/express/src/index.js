require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a MailerLite webhook signature.
 * The Signature header is the bare hex HMAC-SHA256 of the raw body, keyed with the
 * webhook's secret as a UTF-8 string. No prefix, no timestamp.
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - Signature header value
 * @param {string} secret - Webhook secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyMailerLiteWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Compare as UTF-8 bytes; lengths differ for malformed signatures, which throws
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

function handleEvent(event) {
  // Flat payloads carry `event`; nested and batched payloads carry `type`
  const name = event.event || event.type;

  switch (name) {
    case 'subscriber.created':
      console.log(`New subscriber: ${event.email}`);
      break;
    case 'subscriber.updated':
      console.log(`Subscriber updated: ${event.email}`);
      break;
    case 'subscriber.unsubscribed':
      console.log(`Subscriber unsubscribed: ${event.email}`);
      break;
    case 'subscriber.bounced':
      console.log(`Subscriber bounced: ${event.email}`);
      break;
    case 'subscriber.added_to_group':
      console.log(`${event.subscriber?.email} added to group ${event.group?.name}`);
      break;
    case 'campaign.sent':
      console.log(`Campaign sent: ${event.name} (${event.total_recipients} recipients)`);
      break;
    case 'campaign.open':
    case 'campaign.click':
      console.log(`${name}: ${event.subscriber?.email} on ${event.campaign?.name}`);
      break;
    default:
      console.log(`Unhandled event: ${name}`);
  }
}

// MailerLite webhook endpoint - raw body for any content type so the signature verifies
app.post('/webhooks/mailerlite',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['signature'];

    if (!verifyMailerLiteWebhook(req.body, signature, process.env.MAILERLITE_WEBHOOK_SECRET)) {
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

    // Batchable webhooks deliver { events: [...], total }
    const events = Array.isArray(payload.events) ? payload.events : [payload];
    for (const event of events) {
      handleEvent(event);
    }

    // Respond 2xx within 3 seconds or MailerLite retries (10s, 100s, 1000s)
    res.json({ received: true });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyMailerLiteWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mailerlite`);
  });
}
