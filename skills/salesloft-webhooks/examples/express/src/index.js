require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Salesloft webhook signature.
 *
 * Salesloft sends x-salesloft-signature = hex(HMAC-SHA1(callback_token, rawBody)).
 * There is no timestamp and no prefix.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - x-salesloft-signature header value
 * @param {string|undefined} callbackToken - callback_token of the subscription
 * @returns {boolean} - Whether the signature is valid
 */
function verifySalesloftSignature(rawBody, signature, callbackToken) {
  if (!signature || !callbackToken) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', callbackToken)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

/**
 * Handle a verified event. The event name is in the x-salesloft-event header.
 */
function handleSalesloftEvent(eventType, payload) {
  switch (eventType) {
    case 'person_created':
      console.log('Person created');
      // TODO: Sync the new person to your CRM or data warehouse
      break;

    case 'person_updated':
      console.log('Person updated');
      // TODO: Update your copy of the person
      break;

    case 'call_created':
      console.log('Call created');
      // TODO: Log the call activity
      break;

    case 'email_updated':
      console.log('Email updated');
      // TODO: Track opens, clicks, and replies
      break;

    case 'meeting_booked':
      console.log('Meeting booked');
      // TODO: Notify the account owner or create a calendar event
      break;

    case 'cadence_membership_created':
      console.log('Cadence membership created');
      // TODO: Record that a person was added to a cadence
      break;

    default:
      console.log(`Unhandled Salesloft event: ${eventType}`);
  }
}

// Salesloft webhook endpoint - must use the raw body for signature verification.
// type: '*/*' reads the body as a Buffer whatever the Content-Type is.
app.post('/webhooks/salesloft',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const callbackToken = process.env.SALESLOFT_CALLBACK_TOKEN;
    if (!callbackToken) {
      console.error('SALESLOFT_CALLBACK_TOKEN is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-salesloft-signature'];
    if (!signature) {
      return res.status(400).send('Missing x-salesloft-signature header');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifySalesloftSignature(rawBody, signature, callbackToken)) {
      console.error('Salesloft webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    handleSalesloftEvent(req.headers['x-salesloft-event'], payload);

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifySalesloftSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/salesloft`);
  });
}
