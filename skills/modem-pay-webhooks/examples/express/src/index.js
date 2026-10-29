// Generated with: modem-pay-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Modem Pay signs every delivery:
//   x-modem-signature: <hex>
// <hex> = HMAC-SHA512 of the request body, keyed with the webhook secret (Developers > Webhooks in
// the Modem Pay dashboard) used as-is. There is no timestamp and no prefix such as "sha512=".
// https://docs.modempay.com/documentation/core/webhooks#webhook-security-and-signature-validation
//
// Hash the RAW body bytes. Modem Pay's own snippets hash JSON.stringify(req.body), which only works
// while re-serialising reproduces the exact bytes that were sent; the raw body always does.
function verifyModemPay(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  const signature = signatureHeader.trim();
  // 128 hex characters (case-insensitive) before decoding or comparing anything
  if (!/^[0-9a-fA-F]{128}$/.test(signature)) return false;
  const expected = Buffer.from(crypto.createHmac('sha512', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(signature.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x) => (typeof x === 'string' ? x : undefined);

// express.raw({ type: '*/*' }) keeps the exact bytes for any Content-Type (Modem Pay doesn't document
// one). Do not put express.json() in front of this route.
app.post('/webhooks/modem-pay', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.MODEM_PAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MODEM_PAY_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyModemPay(rawBody, req.get('x-modem-signature'), secret)) {
    console.error('Modem Pay webhook signature verification failed');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Verified. Now parse, and treat every field as untrusted until its type is checked.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!isObject(event) || typeof event.event !== 'string' || !isObject(event.payload)) {
    return res.status(400).json({ error: 'Expected {"event": string, "payload": object}' });
  }

  const { payload } = event;
  // There is no delivery id: dedupe retries on (event, payload.id), e.g. in a unique DB index.
  const ref = str(payload.id) ?? '(no id)';

  switch (event.event) {
    case 'charge.succeeded':
      console.log(`Charge succeeded: ${ref} ${payload.amount} ${str(payload.currency) ?? ''}`.trimEnd());
      // TODO: mark the order paid (check payload.test_mode before fulfilling)
      break;
    case 'charge.updated':
      console.log(`Charge updated: ${ref} status=${str(payload.status) ?? 'unknown'}`);
      break;
    case 'payment_intent.created':
      console.log(`Payment intent created: ${ref}`);
      break;
    case 'customer.created':
      console.log(`Customer created: ${ref}`);
      break;
    case 'transfer.succeeded':
      console.log(`Transfer succeeded: ${ref}`);
      break;
    case 'transfer.failed':
      console.log(`Transfer failed: ${ref}`);
      break;
    default:
      // Acknowledge events this handler doesn't process so Modem Pay doesn't retry them
      console.log(`Unhandled Modem Pay event: ${event.event}`);
  }

  // Answer 200 quickly: anything else makes Modem Pay retry (up to 3 times, 10 minutes apart)
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Modem Pay webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyModemPay };
