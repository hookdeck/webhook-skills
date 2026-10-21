// Generated with: pleo-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Pleo delivers webhooks through Svix, using Standard Webhooks headers:
//   webhook-id         unique message id (same value when a delivery is retried)
//   webhook-timestamp  Unix seconds when the delivery was sent
//   webhook-signature  "v1,<base64 signature>" (space-delimited list)
// Pleo's docs don't spell out the signed content. Svix (and Standard Webhooks)
// sign `${webhook-id}.${webhook-timestamp}.${rawBody}` with HMAC-SHA256, keyed
// with the base64-decoded part of the `whsec_` secret after the prefix.
//
// The secret comes from GET /v1/subscriptions/{id}/secret (data.secretKey).
// ---------------------------------------------------------------------------

/**
 * Verify a Pleo delivery with the Standard Webhooks library (Pleo has no
 * webhook SDK of its own). It rejects timestamps more than 5 minutes off,
 * recomputes the HMAC over the raw body, and compares in constant time
 * against every `v1,` entry in the header.
 *
 * @param {string} rawBody - the exact body Pleo sent
 * @param {object} headers - webhook-id, webhook-timestamp, webhook-signature
 * @param {string} secret - the subscription's whsec_ secret
 * @returns {object} the parsed, verified event: { data, eventId, eventType }
 * @throws {Error} if verification fails
 */
function verifyPleoWebhook(rawBody, headers, secret = process.env.PLEO_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers);
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Pleo retries failed deliveries for about 27.5 hours with the same webhook-id.
const processedMessageIds = new Set();

function handleEvent(event) {
  const { eventType, eventId, data } = event;

  switch (eventType) {
    case 'v1.export-job.created':
      // A user clicked Export in Pleo. Fetch the job's items and push them to
      // the accounting system, instead of polling GET /v2/export-jobs.
      console.log(
        `Export job ${data.id} created for company ${data.companyId} ` +
          `(${data.numberOfItems} items, status=${data.status}, event ${eventId})`
      );
      break;

    case 'v1.vendor.created':
      // A DRAFT vendor was added in Pleo. Create it in the accounting system,
      // then activate it in Pleo. The payload already holds the vendor details.
      console.log(
        `Vendor ${data.id} "${data.name}" created (state=${data.state}, event ${eventId})`
      );
      break;

    default:
      console.log(`Unhandled Pleo event type: ${eventType}`);
  }
}

// Pleo webhook endpoint. express.raw() keeps the exact bytes for the HMAC;
// express.json() would re-serialise the body and break verification.
app.post('/webhooks/pleo', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.PLEO_WEBHOOK_SECRET) {
    console.error('PLEO_WEBHOOK_SECRET is not set, rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  let event;
  try {
    event = verifyPleoWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Pleo webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse the webhook-id, so acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Pleo event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Pleo webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pleo`);
  });
}

module.exports = { app, server, verifyPleoWebhook };
