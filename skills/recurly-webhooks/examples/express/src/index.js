// Generated with: recurly-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

const WEBHOOK_SECRET = process.env.RECURLY_WEBHOOK_SECRET;
const BASIC_AUTH_USER = process.env.RECURLY_WEBHOOK_USER;
const BASIC_AUTH_PASSWORD = process.env.RECURLY_WEBHOOK_PASSWORD;

/**
 * Constant-time string comparison that never throws on length mismatch.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify the `recurly-signature` header for a JSON webhook.
 *
 * Header format: "<timestamp>,<sig1>,<sig2>,..."
 *   - timestamp: Unix time in milliseconds, as sent by Recurly
 *   - sig*:      hex HMAC-SHA256 signatures (more than one during a 24h key rotation)
 *
 * Signed message: `${timestamp}.${rawBody}` over the RAW, unparsed request body.
 * The notification is valid if ANY signature matches (constant-time compare).
 */
function verifyRecurlySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const [timestamp, ...signatures] = signatureHeader.split(',');
  if (!timestamp || signatures.length === 0) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody) // Buffer — hashed as raw bytes
    .digest('hex');
  const expectedBuf = Buffer.from(expected);

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig.trim());
    if (sigBuf.length !== expectedBuf.length) return false;
    try {
      return crypto.timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}

/**
 * Verify HTTP Basic Auth. Only enforced when credentials are configured in the
 * environment (i.e. you set them on the endpoint in Recurly too).
 */
function verifyBasicAuth(authHeader) {
  if (!BASIC_AUTH_USER && !BASIC_AUTH_PASSWORD) return true; // not configured → skip
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  const user = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);
  return safeEqual(user, BASIC_AUTH_USER || '') && safeEqual(password, BASIC_AUTH_PASSWORD || '');
}

// Recurly webhook endpoint. Use the RAW body so signature verification sees the
// exact bytes Recurly signed — never parse before verifying.
app.post('/webhooks/recurly', express.raw({ type: '*/*' }), (req, res) => {
  // 1. Optional HTTP Basic Auth (defense in depth; required to secure XML endpoints)
  if (!verifyBasicAuth(req.headers['authorization'])) {
    return res.status(401).send('Unauthorized');
  }

  // 2. Verify the signature over the raw body
  const signature = req.headers['recurly-signature'];
  if (!signature) {
    return res.status(400).send('Missing recurly-signature header');
  }
  if (!verifyRecurlySignature(req.body, signature, WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }

  // 3. Parse AFTER verification. Classic JSON notifications use the notification
  //    type as the single top-level key, wrapping the related objects.
  let notification;
  try {
    notification = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const notificationType = Object.keys(notification)[0];
  const data = notification[notificationType] || {};

  // 4. Dispatch on the notification type
  switch (notificationType) {
    case 'new_subscription_notification':
      console.log('New subscription:', data.subscription && data.subscription.uuid);
      // TODO: provision access, send welcome email, etc.
      break;

    case 'updated_subscription_notification':
      console.log('Subscription updated:', data.subscription && data.subscription.uuid);
      // TODO: adjust entitlements for the new plan/quantity, etc.
      break;

    case 'canceled_subscription_notification':
      console.log('Subscription canceled:', data.subscription && data.subscription.uuid);
      // TODO: schedule access removal at term end, send retention email, etc.
      break;

    case 'expired_subscription_notification':
      console.log('Subscription expired:', data.subscription && data.subscription.uuid);
      // TODO: revoke access, etc.
      break;

    case 'renewed_subscription_notification':
      console.log('Subscription renewed:', data.subscription && data.subscription.uuid);
      // TODO: extend access for the new term, etc.
      break;

    case 'successful_payment_notification':
      console.log('Payment succeeded:', data.transaction && data.transaction.uuid);
      // TODO: record payment, send receipt, etc.
      break;

    case 'failed_payment_notification':
      console.log('Payment failed:', data.transaction && data.transaction.uuid);
      // TODO: notify customer, trigger dunning, etc.
      break;

    default:
      console.log(`Unhandled notification type: ${notificationType}`);
  }

  // Optional: confirm state with the Recurly API before acting on it. Webhooks
  // can arrive out of order, so fetch the object to read its current state:
  //
  //   const recurly = require('recurly');
  //   const client = new recurly.Client(process.env.RECURLY_API_KEY);
  //   const sub = await client.getSubscription('uuid-' + data.subscription.uuid);

  // Acknowledge receipt quickly; do heavy work asynchronously.
  res.status(200).json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/recurly`);
  });
}
