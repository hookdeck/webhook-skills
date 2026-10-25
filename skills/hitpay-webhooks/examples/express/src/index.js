// Generated with: hitpay-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * HitPay event webhooks: Hitpay-Signature is the hex HMAC-SHA256 of the raw body,
 * keyed with that webhook endpoint's salt (Developers > Webhooks).
 * Legacy payment-request/charge callbacks (an "hmac" field in the payload, API-key
 * salt) use a different scheme and are not handled here.
 */
function verifyHitpaySignature(rawBody, signature, salt = process.env.HITPAY_WEBHOOK_SALT) {
  if (!salt) return false; // never accept when unconfigured
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', salt).update(rawBody).digest('hex');
  // Both are 64 lowercase hex chars: equal-length buffers, so timingSafeEqual cannot throw.
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
}

/**
 * The body carries no event name. Dispatch on "{Hitpay-Event-Object}.{Hitpay-Event-Type}".
 */
function handleEvent(eventName, data) {
  switch (eventName) {
    case 'charge.created':
      console.log(`Charge created: ${data.id} (${data.currency} ${data.amount}, status ${data.status})`);
      // TODO: fulfil the order, keyed on data.id (webhooks can repeat)
      return;
    case 'charge.updated':
      console.log(`Charge updated: ${data.id} (refunded ${data.refunded_amount})`);
      // TODO: record the refund / partial refund
      return;
    case 'order.created':
      console.log(`Order created: ${data.id}`);
      // TODO: create the order in your system
      return;
    case 'order.updated':
      console.log(`Order updated: ${data.id} (status ${data.status})`);
      // TODO: sync the order status
      return;
    case 'invoice.created':
      console.log(`Invoice created: ${data.id}`);
      // TODO: store the invoice
      return;
    case 'invoice.updated':
      console.log(`Invoice updated: ${data.id}`);
      // TODO: sync the invoice
      return;
    case 'payout.created':
      console.log(`Payout created: ${data.id}`);
      // TODO: reconcile the payout
      return;
    case 'transfer.created':
    case 'transfer.updated':
    case 'transfer.processing':
    case 'transfer.scheduled':
    case 'transfer.canceled':
      console.log(`${eventName}: ${data.id} (status ${data.status})`);
      // TODO: update the transfer status
      return;
    case 'transfer.paid':
      console.log(`Transfer paid: ${data.id}`);
      // TODO: mark the transfer as paid
      return;
    case 'transfer.failed':
      console.log(`Transfer failed: ${data.id}`);
      // TODO: alert finance
      return;
    default:
      console.log(`Unhandled HitPay event: ${eventName}`);
  }
}

// Read the body raw (any content type) so the signature covers the exact bytes sent.
app.post('/webhooks/hitpay', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyHitpaySignature(rawBody, req.headers['hitpay-signature'])) {
    return res.status(401).json({ error: 'Invalid or missing Hitpay-Signature' });
  }

  const object = req.headers['hitpay-event-object'];
  const type = req.headers['hitpay-event-type'];
  if (typeof object !== 'string' || typeof type !== 'string' || !object || !type) {
    return res.status(400).json({ error: 'Missing Hitpay-Event-Object or Hitpay-Event-Type' });
  }

  let data;
  try {
    data = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(`${object}.${type}`.toLowerCase(), data);
  } catch (err) {
    console.error('Error handling HitPay webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyHitpaySignature = verifyHitpaySignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/hitpay`);
  });
}
