// Generated with: xendit-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the token's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Xendit does not sign the payload (no HMAC). It sends your webhook verification
 * token, unchanged, in the x-callback-token header. Compare it to the token
 * from Dashboard > Settings > Webhooks.
 */
function verifyXenditToken(headers, token = process.env.XENDIT_CALLBACK_TOKEN) {
  if (!token) return false; // never accept when unconfigured
  const received = headers['x-callback-token'];
  if (!received || Array.isArray(received)) return false;
  return safeEqual(received, token);
}

/**
 * Payload shape varies by product:
 *  - Payments API webhooks have an "event" field and the resource under "data".
 *  - Invoice callbacks have no "event": the invoice is the body, with a "status"
 *    such as PAID or EXPIRED.
 */
function handleEvent(payload) {
  const { event, data = {} } = payload;

  switch (event) {
    case 'payment.capture':
      console.log(`Payment captured: ${data.payment_id} (${data.currency} ${data.request_amount})`);
      // TODO: fulfil the order, keyed on data.payment_id (webhooks can repeat)
      return;

    case 'payment.authorization':
      console.log(`Payment authorized: ${data.payment_id}`);
      // TODO: capture the payment or hold the order
      return;

    case 'payment.failure':
      console.log(`Payment failed: ${data.payment_id} (${data.failure_code})`);
      // TODO: release stock, tell the customer
      return;

    case 'payment.expiry':
      console.log(`Payment authorization expired: ${data.payment_id}`);
      // TODO: release the reserved funds in your records
      return;

    case 'payment_request.expiry':
      console.log(`Payment request expired: ${data.payment_request_id || data.id}`);
      // TODO: cancel the pending order
      return;

    case 'payment_token.activation':
      console.log(`Payment token activated: ${data.payment_token_id}`);
      // TODO: store the token for future charges
      return;

    case 'payment_token.failure':
      console.log(`Payment token failed: ${data.payment_token_id}`);
      // TODO: ask the customer to link a payment method again
      return;

    case 'payment_token.expiry':
      console.log(`Payment token expired: ${data.payment_token_id}`);
      // TODO: remove the stored token
      return;

    case 'refund.succeeded':
      console.log(`Refund succeeded: ${data.id}`);
      // TODO: mark the refund as completed
      return;

    case 'refund.failed':
      console.log(`Refund failed: ${data.id}`);
      // TODO: alert support
      return;
  }

  if (!event && payload.status) {
    // Invoice callback (no "event" field)
    if (payload.status === 'PAID') {
      console.log(`Invoice paid: ${payload.external_id || payload.id}`);
      // TODO: mark the order as paid
      return;
    }
    if (payload.status === 'EXPIRED') {
      console.log(`Invoice expired: ${payload.external_id || payload.id}`);
      // TODO: cancel the order
      return;
    }
  }

  console.log(`Unhandled Xendit webhook: ${event || payload.status}`);
}

// Read the body raw (any content type) so the token is checked before parsing.
app.post('/webhooks/xendit', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyXenditToken(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing x-callback-token' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Xendit webhook:', err);
    // A non-2xx makes Xendit retry (up to 6 times over 24 hours).
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyXenditToken = verifyXenditToken;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/xendit`);
  });
}
