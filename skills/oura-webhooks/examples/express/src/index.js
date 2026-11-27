// Generated with: oura-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Oura webhook signature.
 *
 * HMAC-SHA256 over (x-oura-timestamp + raw body), keyed with the client secret,
 * hex-encoded and UPPERCASED, compared timing-safely to the x-oura-signature header.
 *
 * @param {string} rawBody - Raw request body (exact bytes as received)
 * @param {string} signature - x-oura-signature header value
 * @param {string} timestamp - x-oura-timestamp header value
 * @param {string} clientSecret - Oura client secret (OURA_CLIENT_SECRET)
 * @returns {boolean}
 */
function verifyOuraSignature(rawBody, signature, timestamp, clientSecret) {
  if (!signature || !timestamp) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(timestamp + rawBody)
    .digest('hex')
    .toUpperCase();

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Different lengths = invalid
    return false;
  }
}

/**
 * Subscription handshake (GET).
 * Oura calls this when you create a subscription.
 */
app.get('/webhooks/oura', (req, res) => {
  const { verification_token, challenge } = req.query;

  if (verification_token && verification_token === process.env.OURA_VERIFICATION_TOKEN) {
    // Echo the challenge back as JSON to activate the subscription
    return res.status(200).json({ challenge });
  }

  return res.status(401).send('Invalid verification token');
});

/**
 * Event delivery (POST). Uses the raw body for signature verification.
 */
app.post('/webhooks/oura',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-oura-signature'];
    const timestamp = req.headers['x-oura-timestamp'];
    const rawBody = req.body.toString('utf8');

    // Verify the signature before trusting the payload
    if (!verifyOuraSignature(rawBody, signature, timestamp, process.env.OURA_CLIENT_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Acknowledge quickly (Oura expects a 2xx within 10s), then process
    res.status(200).send('OK');

    // Parse the (thin) payload after verification
    const { event_type, data_type, object_id, event_time, user_id } = JSON.parse(rawBody);
    console.log(`Received ${event_type} ${data_type} for user ${user_id} (object ${object_id})`);

    // Dispatch on data_type. Payloads are thin — fetch the full record via the API
    // using object_id, e.g. GET /v2/usercollection/{data_type}/{object_id}.
    switch (data_type) {
      case 'sleep':
        console.log(`Sleep ${event_type} at ${event_time}`);
        // Your code: fetch GET /v2/usercollection/sleep/{object_id}
        break;

      case 'daily_sleep':
        console.log(`Daily sleep summary ${event_type}`);
        // Your code: fetch GET /v2/usercollection/daily_sleep/{object_id}
        break;

      case 'daily_readiness':
        console.log(`Daily readiness ${event_type}`);
        // Your code: fetch GET /v2/usercollection/daily_readiness/{object_id}
        break;

      case 'daily_activity':
        console.log(`Daily activity ${event_type}`);
        // Your code: fetch GET /v2/usercollection/daily_activity/{object_id}
        break;

      case 'workout':
        console.log(`Workout ${event_type}`);
        // Your code: fetch GET /v2/usercollection/workout/{object_id}
        break;

      default:
        console.log(`Unhandled data_type: ${data_type}`);
    }
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyOuraSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/oura`);
  });
}
