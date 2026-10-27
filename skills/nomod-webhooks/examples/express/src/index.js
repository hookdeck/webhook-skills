// Generated with: nomod-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Nomod (Svix) signed, whatever the content type
app.post('/webhooks/nomod', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.NOMOD_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('NOMOD_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Nomod webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Body: { type, eventId, objectId, data }. `type` is the event name, `objectId` the charge
  // (ch_...) and `data` the full charge. Do not confuse it with data.events[].type, which is
  // the charge's own history ("completed").
  const { type, eventId, objectId } = event;
  const charge = event.data ?? {};
  // `eventId` is stable across redeliveries: use it to ignore repeated deliveries.
  console.log(`Received Nomod webhook ${eventId}: ${type} (${objectId} -> ${charge.status})`);

  switch (type) {
    case 'charge.created':
      // A payment object exists and is awaiting customer action
      console.log('Charge created:', objectId, charge.total, charge.currency);
      break;
    case 'charge.authorised':
      // Funds are reserved on the customer's card, awaiting capture
      console.log('Charge authorised:', objectId, charge.total, charge.currency);
      break;
    case 'charge.completed':
      // Funds captured and settled: fulfil the order
      console.log('Charge completed:', objectId, charge.total, charge.currency, charge.referenceId);
      break;
    case 'charge.failed':
      // Declined at authorisation or capture
      console.log('Charge failed:', objectId, charge.error);
      break;
    case 'charge.cancelled':
      // The authorisation was voided before capture
      console.log('Charge cancelled:', objectId);
      break;
    case 'charge.refunded':
      console.log('Charge refunded:', objectId, charge.refundTotal, charge.currency);
      break;
    case 'charge.partially_refunded':
      // The remaining amount stays settled
      console.log('Charge partially refunded:', objectId, charge.refundTotal, charge.currency);
      break;
    case 'charge.dispute.created':
      // A chargeback or dispute was opened by the customer
      console.log('Dispute created:', objectId);
      break;
    default:
      // Return 200 for events you don't handle, or Nomod keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Nomod webhook server running on http://localhost:${PORT}/webhooks/nomod`);
  });
}
