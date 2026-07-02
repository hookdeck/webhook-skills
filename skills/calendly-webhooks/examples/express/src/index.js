// Generated with: calendly-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
// Reject timestamps older than this (seconds) to prevent replay attacks
const TOLERANCE_SECONDS = 180;

/**
 * Verify a Calendly webhook signature.
 *
 * Calendly sends a `Calendly-Webhook-Signature` header formatted as
 * `t=<timestamp>,v1=<signature>`. The signature is HMAC-SHA256 (hex) over
 * `{timestamp}.{raw body}` using the subscription's signing key.
 *
 * @param {Buffer|string} rawBody - the raw, unparsed request body
 * @param {string} header - the Calendly-Webhook-Signature header value
 * @param {string} signingKey - the subscription's signing key
 * @param {number} toleranceSec - max allowed age of the timestamp
 * @returns {boolean}
 */
function verifyCalendlySignature(rawBody, header, signingKey, toleranceSec = TOLERANCE_SECONDS) {
  if (!header) return false;

  // Parse "t=...,v1=..." into { t, v1 }
  const parts = Object.fromEntries(
    header.split(',').map((part) => part.split('='))
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Replay protection: reject stale timestamps
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSec) return false;

  // Signed content is "{timestamp}.{raw body}" — use the raw body, not parsed JSON
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  // Timing-safe comparison (returns false on length mismatch instead of throwing)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// Calendly webhook endpoint - must use the raw body for signature verification
app.post(
  '/webhooks/calendly',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const header = req.headers['calendly-webhook-signature'];

    if (!header) {
      return res.status(400).send('Missing Calendly-Webhook-Signature header');
    }

    if (!verifyCalendlySignature(req.body, header, SIGNING_KEY)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Signature is valid — safe to parse the event
    const event = JSON.parse(req.body.toString('utf8'));

    switch (event.event) {
      case 'invitee.created':
        console.log('Invitee scheduled:', event.payload?.email);
        // TODO: Create CRM record, send confirmation, provision resources, etc.
        break;

      case 'invitee.canceled':
        console.log('Invitee canceled:', event.payload?.email);
        // TODO: Free up availability, trigger win-back flow, update CRM, etc.
        break;

      case 'invitee_no_show.created':
        console.log('Invitee marked as no-show:', event.payload?.invitee);
        // TODO: Flag account, send follow-up, adjust scoring, etc.
        break;

      case 'routing_form_submission.created':
        console.log('Routing form submitted:', event.payload?.uri);
        // TODO: Qualify/route leads, sync to marketing tools, etc.
        break;

      default:
        console.log(`Unhandled event type: ${event.event}`);
    }

    // Return 2xx to acknowledge receipt
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helper for testing
module.exports = app;
module.exports.verifyCalendlySignature = verifyCalendlySignature;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/calendly`);
  });
}
