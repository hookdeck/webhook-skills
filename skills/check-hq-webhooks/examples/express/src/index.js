require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the Check-Signature header.
 * Check sends the lowercase hex HMAC-SHA256 of the raw request body, keyed with
 * the Webhook Config's `key` used as UTF-8 text (not hex-decoded).
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - Check-Signature header value
 * @param {string} key - Webhook Config key
 * @returns {boolean}
 */
function verifyCheckWebhook(rawBody, signatureHeader, key) {
  if (!signatureHeader || !key) {
    return false;
  }

  const expected = crypto.createHmac('sha256', key).update(rawBody).digest('hex');
  const received = signatureHeader.trim().toLowerCase();

  // timingSafeEqual throws on length mismatch, so check first
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Check webhook endpoint. express.raw with '*/*' keeps the exact bytes for any
// content type, which is what the signature is computed over.
app.post('/webhooks/check-hq',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['check-signature'];
    const topic = req.headers['check-topic'];
    const eventId = req.headers['check-webhookevent-id'];

    if (!process.env.CHECK_WEBHOOK_KEY) {
      console.error('CHECK_WEBHOOK_KEY is not set');
      return res.status(500).send('Webhook key not configured');
    }

    if (!Buffer.isBuffer(req.body) || !verifyCheckWebhook(req.body, signature, process.env.CHECK_WEBHOOK_KEY)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The ping test webhook is a flat {"message": "Test webhook"} body
    if (topic === 'ping' || (payload.event === undefined && payload.message)) {
      console.log('Ping received:', payload.message);
      return res.status(200).send('OK');
    }

    const { event, data = {} } = payload;
    console.log(`Received ${topic} ${event} (id: ${eventId})`);

    // Topic is in the Check-Topic header; event is in the body
    switch (`${topic} ${event}`) {
      case 'payroll created':
      case 'payroll updated':
        console.log(`Payroll ${data.id} ${event}: status ${data.status}`);
        // TODO: Fetch the latest payroll from the Check API and sync your records
        break;

      case 'payroll status_change': // deprecated in API version 2025-01-01
        console.log(`Payroll ${data.id} status changed to ${data.status}`);
        break;

      case 'payment status_change':
        console.log(`Payment ${data.id} is now ${data.status}`);
        // TODO: Handle processing, paid, failed or refunded
        break;

      case 'employee created':
      case 'employee updated':
        console.log(`Employee ${data.id} ${event}`);
        // TODO: Sync the employee into your database
        break;

      default:
        console.log(`Unhandled event: ${topic} ${event}`);
    }

    // Return 2XX within 5 seconds, even for events you ignore
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyCheckWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/check-hq`);
  });
}
