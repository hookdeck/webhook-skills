// Generated with: purchasely-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Purchasely signs the X-PURCHASELY-TIMESTAMP header value followed by the raw body
 * (no separator) with HMAC-SHA256 and sends the lowercase hex digest, no prefix, in
 * X-PURCHASELY-REQUEST-SIGNATURE. The message is built as bytes so the body is never
 * decoded and re-encoded.
 */
function computePurchaselySignature(timestamp, rawBody, secret) {
  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), rawBody]);
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function verifyPurchaselyRequest(
  headers,
  rawBody,
  secret = process.env.PURCHASELY_WEBHOOK_SECRET,
  toleranceSeconds = Number(process.env.PURCHASELY_WEBHOOK_TOLERANCE_SECONDS) || 0
) {
  if (!secret) return false; // never accept requests when unconfigured
  const signature = headers['x-purchasely-request-signature'];
  const timestamp = headers['x-purchasely-timestamp'];
  if (typeof signature !== 'string' || typeof timestamp !== 'string' || !timestamp) return false;
  if (!HEX_SHA256.test(signature)) return false; // validate before decoding

  // Opt-in replay window. Off by default: Hookdeck retries and replays resend the
  // original timestamp, so a fixed window would reject legitimate deliveries.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  const expected = Buffer.from(computePurchaselySignature(timestamp, rawBody, secret), 'hex');
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // 32 bytes, validated above
  return crypto.timingSafeEqual(expected, received);
}

// Purchasely retries until it gets HTTP 200, so the same event can arrive more than once.
// event_id is stable across retries. Use a shared store (Redis, DB) in production.
const processed = new Set();

function handleEvent(event) {
  switch (event.event_name) {
    case 'SUBSCRIPTION_STARTED':
      console.log(`Subscription started: ${event.purchasely_subscription_id} (${event.plan}, user ${event.user_id})`);
      // TODO: grant access, start onboarding
      break;

    case 'SUBSCRIPTION_RENEWED':
      console.log(`Subscription renewed: ${event.purchasely_subscription_id}`);
      // TODO: extend access to event.next_renewal_at
      break;

    case 'RENEWAL_DISABLED':
      console.log(`Auto-renew turned off: ${event.purchasely_subscription_id}`);
      // TODO: start a win-back flow
      break;

    case 'GRACE_PERIOD_STARTED':
    case 'ENTERED_BILLING_RETRY':
      console.log(`Billing issue (${event.event_name}): ${event.purchasely_subscription_id}`);
      // TODO: nudge the user to fix their payment method
      break;

    case 'SUBSCRIPTION_TERMINATED':
      console.log(`Subscription terminated: ${event.purchasely_subscription_id}`);
      // TODO: revoke access
      break;

    case 'TRANSACTION_PROCESSED':
      console.log(`Transaction processed: ${event.amount_in_eur} EUR (${event.store})`);
      // TODO: record revenue
      break;

    case 'ACTIVATE':
      console.log(`Entitlement activated for user ${event.user_id}`);
      // TODO: unlock the entitlement
      break;

    default:
      console.log(`Unhandled event: ${event.event_name}`);
  }
}

// Read the body raw so any content type works and the exact bytes are verified.
app.post('/webhooks/purchasely', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyPurchaselyRequest(req.headers, rawBody)) {
    return res.status(401).json({ error: 'Invalid or missing Purchasely signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  if (event.event_id && processed.has(event.event_id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Purchasely event:', err);
    // Any non-200 is retried, and later events for this user wait until it succeeds.
    return res.status(500).json({ error: 'Handler error' });
  }

  if (event.event_id) processed.add(event.event_id);
  // Purchasely acknowledges only an exact HTTP 200 (other 2xx codes are retried).
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPurchaselyRequest = verifyPurchaselyRequest;
module.exports.computePurchaselySignature = computePurchaselySignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/purchasely`);
  });
}
