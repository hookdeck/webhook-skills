// Generated with: savvycal-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const WEBHOOK_SECRET = process.env.SAVVYCAL_WEBHOOK_SECRET;

/**
 * Verify a SavvyCal webhook signature.
 *
 * SavvyCal sends an `x-savvycal-signature` header containing the HMAC-SHA256 of
 * the raw request body, keyed with the webhook's secret. The docs' header example
 * is `sha256=<UPPERCASE hex>`, while their Elixir sample compares the bare
 * uppercase digest, so accept both: strip an optional `sha256=` prefix and
 * compare the hex case-insensitively.
 *
 * @param {Buffer|string} rawBody - the raw, unparsed request body
 * @param {string} header - the x-savvycal-signature header value
 * @param {string} secret - the webhook secret
 * @returns {boolean}
 */
function verifySavvyCalSignature(rawBody, header, secret) {
  if (!header || !secret) return false;

  const received = header.trim().replace(/^sha256=/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Timing-safe comparison (both are 32 bytes once decoded)
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}

// SavvyCal webhook endpoint - raw body for any content type so verification
// always runs against the exact bytes that were signed
app.post('/webhooks/savvycal', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['x-savvycal-signature'];

  if (!header) {
    return res.status(400).send('Missing x-savvycal-signature header');
  }

  if (!Buffer.isBuffer(req.body) || !verifySavvyCalSignature(req.body, header, WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Signature is valid - safe to parse the event
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  switch (event.type) {
    case 'event.created':
      console.log('Event scheduled:', event.id);
      // TODO: Create CRM record, send confirmation, provision resources, etc.
      break;

    case 'event.rescheduled':
      console.log('Event rescheduled:', event.id);
      // TODO: Update calendar holds, notify attendees, sync to CRM, etc.
      break;

    case 'event.canceled':
      console.log('Event canceled:', event.id);
      // TODO: Free up availability, trigger win-back flow, update CRM, etc.
      break;

    case 'event.changed':
      console.log('Event changed:', event.id);
      // TODO: Diff the change details and sync downstream systems
      break;

    case 'event.checkout.completed':
      console.log('Checkout completed:', event.id);
      // TODO: Mark the booking as paid, issue receipts, etc.
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 2xx quickly to acknowledge receipt
  res.json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helper for testing
module.exports = app;
module.exports.verifySavvyCalSignature = verifySavvyCalSignature;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/savvycal`);
  });
}
