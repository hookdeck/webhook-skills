// Generated with: globalstack-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes GlobalStack (Svix) signed, whatever the content type
app.post('/webhooks/globalstack', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.GLOBALSTACK_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('GLOBALSTACK_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('GlobalStack webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Flat envelope: the event name is the top-level `event_type`, and the resource
  // (the REST body plus event-only fields) is in `event_object`
  const type = event.event_type;
  const object = event.event_object ?? {};
  // `event_id` is stable across retries (and equals svix-id without `msg_`): use it to deduplicate.
  // Deliveries are not ordered: judge state by `event_object_status`, not by which event arrived last.
  console.log(`Received GlobalStack webhook ${event.event_id}: ${type} (${event.event_object_id} -> ${event.event_object_status})`);

  switch (type) {
    case 'onramp.awaiting_deposit':
      // Show the payer the deposit instructions
      console.log('Onramp awaiting deposit:', event.event_object_id, object.deposit_instruction);
      break;
    case 'onramp.funds_received':
    case 'offramp.funds_received':
    case 'conversion.funds_received':
      // The money is in, but work has not finished: wait for success, failed or returned
      console.log('Funds received:', type, event.event_object_id);
      break;
    case 'onramp.processing':
    case 'offramp.processing':
    case 'conversion.processing':
    case 'transfer.processing':
      console.log('In flight:', type, event.event_object_id);
      break;
    case 'offramp.created':
    case 'conversion.created':
      console.log('Created:', type, event.event_object_id);
      break;
    case 'onramp.success':
    case 'offramp.success':
    case 'conversion.success':
      // Reconcile against actual_*, not the quoted rate and amounts
      console.log('Succeeded:', type, event.event_object_id, object.actual_source_amount, object.actual_destination_amount, object.actual_rate);
      break;
    case 'onramp.failed':
    case 'offramp.failed':
    case 'conversion.failed':
    case 'transfer.failed':
      // failure_reason tells quote_expired apart from a genuine failure (or a cancelled/reversed transfer)
      console.log('Failed:', type, event.event_object_id, object.failure_reason);
      break;
    case 'onramp.returned':
    case 'offramp.returned':
    case 'conversion.returned':
      // Funds went back to their origin; failure_reason is "returned"
      console.log('Returned:', type, event.event_object_id, object.failure_reason);
      break;
    case 'transfer.success':
      console.log('Transfer succeeded:', event.event_object_id, object.amount, object.currency);
      break;
    case 'deposit.received':
      // Seen but not final; a cross-currency deposit stays here and its conversion.* events carry the outcome
      console.log('Deposit received:', event.event_object_id);
      break;
    case 'deposit.held':
      console.log('Deposit held:', event.event_object_id, object.metadata?.hold_reason);
      break;
    case 'deposit.confirmed':
      console.log('Deposit confirmed:', event.event_object_id, object.destination_amount);
      break;
    case 'deposit.failed':
      console.log('Deposit failed:', event.event_object_id);
      break;
    case 'kyc.approved':
      console.log('KYC approved:', event.event_object_id, object.customer?.tier);
      break;
    case 'kyc.rejected':
      console.log('KYC rejected:', event.event_object_id, object.failure_reason);
      break;
    default:
      // Return 200 for events you don't handle, or GlobalStack keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`GlobalStack webhook server running on http://localhost:${PORT}/webhooks/globalstack`);
  });
}
