// Generated with: lago-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Lago webhook signature (HMAC mode).
 *
 * X-Lago-Signature is the base64 HMAC-SHA256 of the raw request body, keyed
 * with the organization HMAC Signature Token.
 *
 * @param {Buffer|string} rawBody  Raw request body
 * @param {string} signatureHeader Value of X-Lago-Signature
 * @param {string} secret          Organization HMAC Signature Token
 * @returns {boolean}
 */
function verifyLagoSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Raw body for every content type, so the signature is computed over the exact bytes
app.post('/webhooks/lago', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-lago-signature'];
  const algorithm = req.headers['x-lago-signature-algorithm'];

  if (!signature) {
    return res.status(400).send('Missing X-Lago-Signature header');
  }

  // Lago defaults to jwt; this handler only supports hmac
  if (algorithm && algorithm !== 'hmac') {
    return res.status(400).send('Unsupported signature algorithm: create the Lago endpoint with hmac');
  }

  if (!Buffer.isBuffer(req.body) || !verifyLagoSignature(req.body, signature, process.env.LAGO_HMAC_KEY)) {
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // X-Lago-Unique-Key is the idempotency key: skip keys you have already processed
  const uniqueKey = req.headers['x-lago-unique-key'];
  const object = event[event.object_type] || {};

  switch (event.webhook_type) {
    case 'invoice.created':
      console.log('Invoice created:', object.lago_id, uniqueKey);
      // TODO: Record receivable, send invoice
      break;

    case 'invoice.payment_status_updated':
      console.log('Invoice payment status:', object.lago_id, object.payment_status);
      // TODO: Mark invoice paid/failed internally
      break;

    case 'subscription.started':
      console.log('Subscription started:', object.external_id ?? object.lago_id);
      // TODO: Provision access
      break;

    case 'subscription.terminated':
      console.log('Subscription terminated:', object.external_id ?? object.lago_id);
      // TODO: Revoke access
      break;

    case 'customer.created':
      console.log('Customer created:', object.external_id ?? object.lago_id);
      // TODO: Sync customer to CRM
      break;

    case 'wallet.depleted_ongoing_balance':
      console.log('Wallet depleted:', object.lago_id);
      // TODO: Prompt a top-up
      break;

    default:
      console.log(`Unhandled event type: ${event.webhook_type}`);
  }

  res.json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyLagoSignature };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/lago`);
  });
}
