require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Event IDs already handled. Use a database or Redis in production.
const processedEvents = new Set();

// Asaas does not sign payloads. It sends the authToken you configured, unchanged,
// in the asaas-access-token header. Compare it in constant time.
function verifyAsaasToken(receivedToken, expectedToken) {
  if (!receivedToken || !expectedToken) return false;
  // Hash both sides so timingSafeEqual always gets equal-length buffers.
  const a = crypto.createHash('sha256').update(receivedToken).digest();
  const b = crypto.createHash('sha256').update(expectedToken).digest();
  return crypto.timingSafeEqual(a, b);
}

// Raw body: authenticate first, parse JSON only after the token check passes.
app.post('/webhooks/asaas', express.raw({ type: '*/*' }), (req, res) => {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken) {
    console.error('ASAAS_WEBHOOK_TOKEN is not set');
    return res.status(500).send('Webhook token not configured');
  }

  if (!verifyAsaasToken(req.headers['asaas-access-token'], expectedToken)) {
    return res.status(401).send('Invalid asaas-access-token');
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  if (!body || typeof body.event !== 'string') {
    return res.status(400).send('Missing event');
  }

  // Delivery is at-least-once: skip events whose id we have already processed.
  if (body.id && processedEvents.has(body.id)) {
    return res.json({ received: true, duplicate: true });
  }
  if (body.id) processedEvents.add(body.id);

  switch (body.event) {
    case 'PAYMENT_CREATED':
      console.log(`Charge created: ${body.payment?.id}`);
      break;
    case 'PAYMENT_CONFIRMED':
      console.log(`Payment confirmed (balance not yet available): ${body.payment?.id}`);
      break;
    case 'PAYMENT_RECEIVED':
      console.log(`Payment received: ${body.payment?.id} (${body.payment?.value})`);
      break;
    case 'PAYMENT_OVERDUE':
      console.log(`Charge overdue: ${body.payment?.id}`);
      break;
    case 'PAYMENT_REFUNDED':
      console.log(`Charge refunded: ${body.payment?.id}`);
      break;
    case 'SUBSCRIPTION_CREATED':
      console.log(`Subscription created: ${body.subscription?.id}`);
      break;
    case 'TRANSFER_DONE':
      console.log(`Transfer done: ${body.transfer?.id}`);
      break;
    default:
      console.log(`Unhandled event: ${body.event}`);
  }

  // Persist first, respond 200 quickly, and do slow work asynchronously.
  res.json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Asaas webhook server listening on http://localhost:${port}`);
  });
}

module.exports = app;
