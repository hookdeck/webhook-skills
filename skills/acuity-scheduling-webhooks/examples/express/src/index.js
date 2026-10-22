// Generated with: acuity-scheduling-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Acuity signs webhooks with your account API key (no separate webhook secret)
const API_KEY = process.env.ACUITY_API_KEY;

/**
 * Verify an Acuity Scheduling webhook signature.
 *
 * Acuity sends the base64 HMAC-SHA256 of the raw request body, keyed with the
 * account API key, in the `X-Acuity-Signature` header. There is no timestamp.
 *
 * @param {Buffer|string} rawBody - the raw, unparsed request body
 * @param {string} signatureHeader - the X-Acuity-Signature header value
 * @param {string} apiKey - the Acuity API key
 * @returns {boolean}
 */
function verifyAcuitySignature(rawBody, signatureHeader, apiKey) {
  if (!signatureHeader || !apiKey) return false;

  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(rawBody)
    .digest('base64');

  // Timing-safe comparison (lengths must match first, or timingSafeEqual throws)
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Acuity webhook endpoint. Bodies are application/x-www-form-urlencoded, but we
// read the raw bytes for any content type so verification always sees them.
app.post(
  '/webhooks/acuity-scheduling',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-acuity-signature'];

    if (!signature) {
      return res.status(400).send('Missing X-Acuity-Signature header');
    }

    if (!Buffer.isBuffer(req.body) || !verifyAcuitySignature(req.body, signature, API_KEY)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Signature is valid: now it is safe to parse the form-encoded body
    const params = new URLSearchParams(req.body.toString('utf8'));
    const action = params.get('action');
    const id = params.get('id');

    switch (action) {
      case 'scheduled':
        console.log('Appointment scheduled:', id, 'calendar', params.get('calendarID'));
        // TODO: Fetch the appointment by ID, create CRM record, send confirmation, etc.
        break;

      case 'rescheduled':
        console.log('Appointment rescheduled:', id);
        // TODO: Update calendar entries, notify staff, etc.
        break;

      case 'canceled':
        console.log('Appointment canceled:', id);
        // TODO: Free up capacity, trigger follow-up, update CRM, etc.
        break;

      case 'changed':
        console.log('Appointment changed:', id);
        // TODO: Re-sync the appointment (catch-all; may duplicate the actions above)
        break;

      case 'order.completed':
        console.log('Order completed:', id);
        // TODO: Fetch the order, provision package or gift certificate credit, etc.
        break;

      default:
        console.log(`Unhandled action: ${action}`);
    }

    // Return 2xx to acknowledge receipt (Acuity retries only on 500 or network errors)
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helper for testing
module.exports = app;
module.exports.verifyAcuitySignature = verifyAcuitySignature;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/acuity-scheduling`);
  });
}
