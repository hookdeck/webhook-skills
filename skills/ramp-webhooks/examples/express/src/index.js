require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Ramp webhook signature.
 *
 * Ramp sends X-Ramp-Signature = hex(HMAC-SHA256(secret, rawBody)), where the
 * secret is the raw string returned when the subscription was created.
 * There is no timestamp or prefix in the signed content.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - X-Ramp-Signature header value
 * @param {string|undefined} secret - Subscription secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyRampSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
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
 * Dispatch a verified Ramp event on its `type`.
 * Payloads carry only IDs; fetch the resource from the Ramp API for details.
 */
function handleRampEvent(event) {
  switch (event.type) {
    case 'webhooks.verification':
      // Sent once when the subscription is created. Returning 2xx is step one;
      // you must also POST the challenge to /developer/v1/webhooks/{id}/verify.
      console.log(`Verification challenge received: ${event.challenge}`);
      break;

    case 'transactions.authorized':
      console.log(`Transaction authorized: ${event.object?.id}`);
      // TODO: Record the pending card authorization
      break;

    case 'transactions.cleared':
      console.log(`Transaction cleared: ${event.object?.id}`);
      // TODO: Fetch the transaction; entity_amount.value is negative for refunds
      break;

    case 'transactions.declined':
      console.log(`Transaction declined: ${event.object?.id}`);
      // TODO: Alert the cardholder or finance team
      break;

    case 'reimbursements.ready_for_review':
      console.log(`Reimbursement ready for review: ${event.object?.id}`);
      // TODO: Route to an approver
      break;

    case 'bills.created':
      console.log(`Bill created: ${event.object?.id}`);
      // TODO: Sync the bill to your accounting system
      break;

    case 'bills.approved':
      console.log(`Bill approved: ${event.object?.id}`);
      // TODO: Schedule payment
      break;

    case 'bills.paid':
      console.log(`Bill paid: ${event.object?.id}`);
      // TODO: Mark the bill as paid
      break;

    case 'tests.test_event':
      console.log('Received Ramp test event');
      break;

    default:
      console.log(`Unhandled Ramp event type: ${event.type}`);
  }
}

// Ramp webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/ramp',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.RAMP_WEBHOOK_SECRET;
    if (!secret) {
      console.error('RAMP_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-ramp-signature'];
    if (!signature) {
      return res.status(400).send('Missing X-Ramp-Signature header');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyRampSignature(rawBody, signature, secret)) {
      console.error('Ramp webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Business events repeat the same event.id on every retry (also sent as
    // X-Ramp-Webhook-ID); use it to de-duplicate.
    handleRampEvent(event);

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyRampSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ramp`);
  });
}
