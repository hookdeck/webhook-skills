// Generated with: jobber-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Jobber webhook signature.
 *
 * Jobber sends `X-Jobber-Hmac-SHA256`: the base64 HMAC-SHA256 of the RAW request
 * body, keyed with your app's OAuth client secret. The header is compared as a
 * string (no base64 decoding) so lenient decoding can't accept altered values.
 *
 * @param {Buffer} rawBody - Raw request body (exact bytes received)
 * @param {string} signatureHeader - `X-Jobber-Hmac-SHA256` header value
 * @param {string} clientSecret - Your app's OAuth client secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyJobberSignature(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader || !clientSecret) return false;

  const expected = Buffer.from(
    crypto.createHmac('sha256', clientSecret).update(rawBody).digest('base64'),
    'utf8'
  );
  const received = Buffer.from(String(signatureHeader), 'utf8');

  // timingSafeEqual throws on length mismatch, so check first.
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

/**
 * Handle a Jobber webhook event. Payloads are thin: use `itemId` to fetch the
 * object through the Jobber GraphQL API. Delivery is at-least-once, so dedupe
 * (e.g. on accountId + itemId + topic + occurredAt).
 */
function handleEvent(event) {
  switch (event.topic) {
    case 'CLIENT_CREATE':
      console.log('Client created:', event.itemId);
      // TODO: query the client by itemId via GraphQL and sync it to your CRM
      break;

    case 'INVOICE_UPDATE':
      console.log('Invoice updated:', event.itemId);
      // TODO: query the invoice by itemId via GraphQL and reconcile status/payments
      break;

    case 'APP_CONNECT':
      console.log('App connected:', event.accountId);
      // TODO: store the account link for this accountId
      break;

    case 'APP_DISCONNECT':
      console.log('App disconnected:', event.accountId);
      // TODO: revoke tokens and clean up data for this accountId (required for Marketplace apps)
      break;

    default:
      console.log(`Unhandled topic: ${event.topic} (${event.itemId})`);
  }
}

// Jobber webhook endpoint - must use the RAW body for signature verification.
// '*/*' makes it work whatever Content-Type Jobber (or Hookdeck) sends.
app.post('/webhooks/jobber',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-jobber-hmac-sha256'];

    if (!verifyJobberSignature(req.body, signature, process.env.JOBBER_CLIENT_SECRET)) {
      console.error('Jobber signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const event = payload && payload.data && payload.data.webHookEvent;
    if (!event || !event.topic) {
      return res.status(400).send('Missing webHookEvent');
    }

    handleEvent(event);

    // Jobber expects a response within 1 second: do heavy work asynchronously.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyJobberSignature, handleEvent };

// Start server only when run directly (not when imported for tests)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/jobber`);
  });
}
