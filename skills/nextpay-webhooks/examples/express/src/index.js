// Generated with: nextpay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes NextPay (Svix) signed, whatever the content type
app.post('/webhooks/nextpay', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.NEXTPAY_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('NEXTPAY_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = req.headers['svix-id'] ? 'svix' : 'webhook';
  const id = req.headers[`${prefix}-id`];
  const timestamp = req.headers[`${prefix}-timestamp`];
  const signature = req.headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
    new Webhook(secret).verify(req.body, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('NextPay webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Two body shapes: v2.* payment events are {event, payload}; payout and platform events are {type, data}
  // (NextPay's own guide reads `event.event || event.type`)
  const type = event.event || event.type;
  const object = event.payload ?? event.data ?? {};
  // `svix-id` is stable across retries and replays: use it (or the event's `id`) to deduplicate.
  // Ordering is not documented, so judge state by the resource's `status`, not by arrival order.
  console.log(`Received NextPay webhook ${id}: ${type}`);

  switch (type) {
    case 'v2.payment_intent.succeeded':
      // Payment received and settled: fulfil the order via payload.external_id
      console.log('Payment intent succeeded:', object.id, object.external_id, object.amount);
      break;
    case 'v2.payment_intent.canceled':
      console.log('Payment intent canceled:', object.id, object.external_id);
      break;
    case 'v2.payment_instrument.used':
      // A single-use Funding Method instrument was used
      console.log('Payment instrument used:', object.id);
      break;
    case 'v2.payment_instrument.payment_received':
      // Incoming payment received on a Funding Method, not yet cleared
      console.log('Payment received:', object.id, object.amount);
      break;
    case 'v2.payment_instrument.payment_settled':
      console.log('Payment settled:', object.id, object.amount);
      break;
    case 'payout_request.creation_failed':
    case 'payout_request.queue_failed':
      console.log('Payout request failed:', type, object.id);
      break;
    case 'payout_request.queued':
      console.log('Payout request queued:', object.id);
      break;
    case 'payout_request.processed':
      console.log('Payout request processed:', object.id, object.status);
      break;
    case 'payout.succeeded':
    case 'payout.processed':
      console.log('Payout delivered:', type, object.id, object.amount_cents);
      break;
    case 'payout.failed':
    case 'payout.processing_failed':
      console.log('Payout failed:', type, object.id);
      break;
    case 'deposit.confirmed':
      console.log('Deposit confirmed:', object.id);
      break;
    case 'direct_transfer.received':
      console.log('Direct transfer received:', object.id);
      break;
    case 'legal_entity.verification_status_changed':
      // Merchant KYC/compliance status changed
      console.log('Verification status changed:', object.id, object.status);
      break;
    default:
      // Return 2xx for events you don't handle; 4xx is not retried but 5xx is
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`NextPay webhook server running on http://localhost:${PORT}/webhooks/nextpay`);
  });
}
