// Generated with: mollie-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const { createMollieClient } = require('@mollie/api-client');

// Mollie webhooks are NOT signed. The POST body is application/x-www-form-urlencoded
// and contains a single `id` (e.g. tr_xxx). The status is deliberately NOT sent.
// We must fetch the payment from the Mollie API to read its authoritative status.
// This "fetch-to-confirm" flow is the security model: a forged webhook can only
// make us re-fetch a real payment we already own.

// Default fetcher — lazily creates the Mollie client so the module can be
// imported (e.g. in tests) without MOLLIE_API_KEY being set.
function defaultFetchPayment() {
  let client;
  return async (id) => {
    if (!client) {
      const apiKey = process.env.MOLLIE_API_KEY;
      if (!apiKey) throw new Error('MOLLIE_API_KEY is not set');
      client = createMollieClient({ apiKey });
    }
    try {
      return await client.payments.get(id);
    } catch (err) {
      // 404 => unknown/deleted id: acknowledge with 200, nothing to do.
      if (err && err.statusCode === 404) return null;
      throw err; // transient (network / 5xx) => let the handler return 500 so Mollie retries
    }
  };
}

// Act on the authoritative status from the fetched payment. Keep this idempotent —
// Mollie may call the webhook more than once for the same status.
function handlePayment(payment) {
  switch (payment.status) {
    case 'paid':
      console.log(`Payment ${payment.id} paid:`, payment.amount);
      // TODO: fulfill the order, send a receipt
      break;
    case 'authorized':
      console.log(`Payment ${payment.id} authorized (capture to collect)`);
      // TODO: capture the payment when ready to collect funds
      break;
    case 'canceled':
      console.log(`Payment ${payment.id} canceled`);
      // TODO: release reserved stock
      break;
    case 'expired':
      console.log(`Payment ${payment.id} expired`);
      // TODO: release reserved stock, optionally prompt a retry
      break;
    case 'failed':
      console.log(`Payment ${payment.id} failed`);
      // TODO: notify the customer, offer a retry
      break;
    case 'pending':
      console.log(`Payment ${payment.id} pending`);
      break;
    case 'open':
      console.log(`Payment ${payment.id} still open`);
      break;
    default:
      console.log(`Payment ${payment.id} has unhandled status: ${payment.status}`);
  }
}

// Factory so tests can inject a fake `fetchPayment` instead of calling Mollie.
function createApp({ fetchPayment = defaultFetchPayment() } = {}) {
  const app = express();

  // Mollie sends application/x-www-form-urlencoded, NOT JSON.
  app.post(
    '/webhooks/mollie',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      const id = req.body && req.body.id;
      if (!id) {
        // Not a valid Mollie webhook.
        return res.status(400).send('Missing id');
      }

      let payment;
      try {
        payment = await fetchPayment(id);
      } catch (err) {
        // Mollie API was unreachable / errored — return 500 so Mollie retries later.
        console.error(`Failed to fetch payment ${id}:`, err.message);
        return res.status(500).send('Could not fetch payment');
      }

      if (!payment) {
        // Unknown/deleted id — acknowledge so Mollie stops retrying.
        return res.status(200).send('OK');
      }

      handlePayment(payment);
      return res.status(200).send('OK');
    }
  );

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

module.exports = { createApp, handlePayment };

if (require.main === module) {
  const app = createApp();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mollie`);
  });
}
