require('dotenv').config();
const express = require('express');
const { parse, InvalidSignatureError } = require('gocardless-nodejs/webhooks');

const app = express();

const WEBHOOK_SECRET = process.env.GOCARDLESS_WEBHOOK_SECRET;

/**
 * GoCardless webhook endpoint.
 *
 * GoCardless signs the RAW request body with HMAC-SHA256 (hex) and sends it in the
 * `Webhook-Signature` header, so we must read the body as a Buffer (not parsed JSON)
 * before verifying. The official SDK's `parse()` verifies the signature (timing-safe)
 * and returns the events array, throwing `InvalidSignatureError` on mismatch.
 */
app.post(
  '/webhooks/gocardless',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['webhook-signature'];

    if (!signature) {
      console.error('Missing Webhook-Signature header');
      return res.status(498).send('Missing signature');
    }

    let events;
    try {
      // parse(body, webhookSecret, signatureHeader) — note the parameter order.
      events = parse(req.body, WEBHOOK_SECRET, signature);
    } catch (err) {
      if (err instanceof InvalidSignatureError) {
        console.error('Invalid GoCardless webhook signature');
        // Any non-2xx makes GoCardless retry; 498 is the documented "invalid token".
        return res.status(498).send('Invalid signature');
      }
      console.error('Failed to parse GoCardless webhook:', err.message);
      return res.status(400).send('Bad request');
    }

    // A single webhook is a BATCH of events (up to 250). Process each one.
    // GoCardless retries the whole batch on any non-2xx, so handlers must be
    // idempotent on event.id.
    for (const event of events) {
      handleEvent(event);
    }

    // Acknowledge the whole batch.
    res.status(204).send();
  }
);

/**
 * Dispatch a single event by resource_type + action.
 * @param {{id: string, resource_type: string, action: string, links?: object, details?: object}} event
 */
function handleEvent(event) {
  console.log(`Event ${event.id}: ${event.resource_type}.${event.action}`);

  switch (event.resource_type) {
    case 'payments':
      handlePayment(event);
      break;
    case 'mandates':
      handleMandate(event);
      break;
    case 'payouts':
      handlePayout(event);
      break;
    case 'refunds':
      handleRefund(event);
      break;
    case 'subscriptions':
      handleSubscription(event);
      break;
    default:
      console.log(`Unhandled resource_type: ${event.resource_type}`);
  }
}

function handlePayment(event) {
  switch (event.action) {
    case 'confirmed':
      console.log(`Payment ${event.links?.payment} confirmed`);
      // TODO: mark the payment as collected, fulfil the order, etc.
      break;
    case 'paid_out':
      console.log(`Payment ${event.links?.payment} paid out`);
      break;
    case 'failed':
      console.log(`Payment ${event.links?.payment} failed:`, event.details?.description);
      // TODO: notify the customer, schedule a retry, etc.
      break;
    case 'cancelled':
      console.log(`Payment ${event.links?.payment} cancelled`);
      break;
    case 'charged_back':
      console.log(`Payment ${event.links?.payment} charged back`);
      break;
    default:
      console.log(`Unhandled payments action: ${event.action}`);
  }
}

function handleMandate(event) {
  switch (event.action) {
    case 'active':
      console.log(`Mandate ${event.links?.mandate} is active`);
      break;
    case 'cancelled':
      console.log(`Mandate ${event.links?.mandate} cancelled:`, event.details?.description);
      // TODO: suspend the customer's subscription/membership, etc.
      break;
    case 'failed':
      console.log(`Mandate ${event.links?.mandate} failed`);
      break;
    case 'expired':
      console.log(`Mandate ${event.links?.mandate} expired`);
      break;
    default:
      console.log(`Unhandled mandates action: ${event.action}`);
  }
}

function handlePayout(event) {
  switch (event.action) {
    case 'paid':
      console.log(`Payout ${event.links?.payout} paid`);
      // TODO: reconcile the payout against collected payments.
      break;
    case 'bounced':
      console.log(`Payout ${event.links?.payout} bounced`);
      break;
    default:
      console.log(`Unhandled payouts action: ${event.action}`);
  }
}

function handleRefund(event) {
  switch (event.action) {
    case 'paid':
      console.log(`Refund ${event.links?.refund} paid`);
      break;
    case 'failed':
      console.log(`Refund ${event.links?.refund} failed`);
      break;
    default:
      console.log(`Unhandled refunds action: ${event.action}`);
  }
}

function handleSubscription(event) {
  switch (event.action) {
    case 'created':
      console.log(`Subscription ${event.links?.subscription} created`);
      break;
    case 'cancelled':
      console.log(`Subscription ${event.links?.subscription} cancelled`);
      break;
    default:
      console.log(`Unhandled subscriptions action: ${event.action}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, handleEvent };

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/gocardless`);
  });
}
