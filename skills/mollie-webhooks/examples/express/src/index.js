// Generated with: mollie-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const { createMollieClient } = require('@mollie/api-client');

// Mollie has two webhook systems. Mollie recommends a separate URL for each:
//
// 1. Classic webhooks (POST /webhooks/mollie) — set per payment via `webhookUrl`.
//    NOT signed. The body is application/x-www-form-urlencoded with a single `id`
//    (e.g. tr_xxx) and no status. We fetch the payment from the Mollie API to read
//    its authoritative status ("fetch-to-confirm"): a forged webhook can only make
//    us re-fetch a real payment we already own.
//
// 2. Next-gen webhooks (POST /webhooks/mollie/events) — subscriptions created in the
//    Dashboard or via POST /v2/webhooks. JSON event bodies, signed with
//    `X-Mollie-Signature: sha256=<hex HMAC-SHA256 of the raw body>`.

// Verify a next-gen X-Mollie-Signature header against the raw body.
// During a secret rotation Mollie sends the header twice for 24 hours; Node joins
// repeated headers as "sha256=<a>, sha256=<b>", so accept if any value matches.
function verifyMollieSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return String(signatureHeader)
    .split(',')
    .some((value) => {
      const provided = value.trim().replace(/^sha256=/, '');
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
}

// Act on a verified next-gen event. `entityId` identifies the object; with the full
// payload, a snapshot of it is in `_embedded.entity`. Keep this idempotent.
function handleEvent(event) {
  switch (event.type) {
    case 'payment.paid':
      console.log(`Payment ${event.entityId} paid`);
      // TODO: fulfill the order
      break;
    case 'payment.authorized':
      console.log(`Payment ${event.entityId} authorized (capture to collect)`);
      break;
    case 'payment.canceled':
    case 'payment.expired':
    case 'payment.failed':
      console.log(`Payment ${event.entityId} did not complete: ${event.type}`);
      // TODO: release reserved stock
      break;
    case 'payment-link.paid':
      console.log(`Payment link ${event.entityId} paid`);
      break;
    case 'sales-invoice.paid':
      console.log(`Sales invoice ${event.entityId} paid`);
      break;
    case 'payout.completed':
    case 'payout.failed':
      console.log(`Payout ${event.entityId}: ${event.type}`);
      break;
    default:
      console.log(`Unhandled Mollie event type: ${event.type}`);
  }
}

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

  // Next-gen webhooks: verify X-Mollie-Signature over the RAW body, then parse JSON.
  // Registered before the classic route; express.raw keeps req.body as a Buffer.
  app.post('/webhooks/mollie/events', express.raw({ type: '*/*' }), (req, res) => {
    const secret = process.env.MOLLIE_WEBHOOK_SECRET;
    if (!secret) {
      // Never fail open: without a secret we cannot verify anything.
      console.error('MOLLIE_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifyMollieSignature(rawBody, req.headers['x-mollie-signature'], secret)) {
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      return res.status(400).send('Invalid JSON');
    }

    handleEvent(event);
    return res.status(200).send('OK');
  });

  // Classic webhooks: Mollie sends application/x-www-form-urlencoded, NOT JSON.
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

module.exports = { createApp, handlePayment, handleEvent, verifyMollieSignature };

if (require.main === module) {
  const app = createApp();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Classic webhooks:  POST http://localhost:${PORT}/webhooks/mollie`);
    console.log(`Next-gen webhooks: POST http://localhost:${PORT}/webhooks/mollie/events`);
  });
}
