// Generated with: stigg-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Stigg webhook.
 *
 * Stigg does NOT sign payloads yet (HMAC is on its roadmap). Each event carries
 * the webhook secret in the `Stigg-Webhooks-Secret` header; it must match the
 * secret on the webhook details page. Both sides are hashed so
 * crypto.timingSafeEqual always receives equal-length buffers.
 *
 * @param {string|undefined} header - Stigg-Webhooks-Secret header value
 * @param {string|undefined} secret - STIGG_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyStiggSecret(header, secret) {
  if (!header || !secret) return false;
  const a = crypto.createHash('sha256').update(header).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

function handleStiggEvent(event) {
  // The event name is in `type`; `messageId` is unique per event (use it to de-duplicate)
  switch (event.type) {
    case 'customer.created':
      console.log(`Customer created: ${event.id}`);
      // TODO: Create CRM record / billing profile
      break;
    case 'customer.updated':
      console.log(`Customer updated: ${event.id}`);
      break;
    case 'customer.deleted':
      console.log(`Customer deleted: ${event.id}`);
      break;
    case 'customer.payment_failed':
      console.log(`Payment failed for customer: ${event.customer?.id}`);
      // TODO: Start dunning
      break;
    case 'subscription.created':
      console.log(`Subscription created: ${event.id} (${event.plan?.id})`);
      // TODO: Provision access
      break;
    case 'subscription.updated':
      console.log(`Subscription updated: ${event.id}`);
      break;
    case 'subscription.canceled':
    case 'subscription.expired':
      console.log(`${event.type}: ${event.id}`);
      // TODO: Schedule offboarding / revoke access
      break;
    case 'subscription.trial_started':
    case 'subscription.trial_converted':
    case 'subscription.trial_expired':
    case 'subscription.trial.ends_soon':
      console.log(`Trial event ${event.type}: ${event.id}`);
      break;
    case 'entitlements.updated':
      console.log(`Entitlements updated for customer: ${event.customer?.id}`);
      // TODO: Recompute access gates
      break;
    case 'entitlement.usage_exceeded':
      console.log(`Entitlement usage exceeded: ${event.messageId}`);
      break;
    default:
      console.log(`Unhandled Stigg event: ${event.type}`);
  }
}

// Read the raw body for any content type; there is no body signature, so we parse JSON ourselves
app.post('/webhooks/stigg', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const secret = process.env.STIGG_WEBHOOK_SECRET;

  // Fail closed: without a configured secret there is nothing to check.
  if (!secret) {
    console.error('STIGG_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook authentication not configured');
  }

  if (!verifyStiggSecret(req.headers['stigg-webhooks-secret'], secret)) {
    console.error('Stigg webhook authentication failed');
    return res.status(401).send('Unauthorized');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
    return res.status(400).send('Invalid payload');
  }

  handleStiggEvent(event);

  // Respond 2xx within 30 seconds; Stigg retries on errors and timeouts
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = { app, verifyStiggSecret };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/stigg`);
  });
}
