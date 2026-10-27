// Generated with: swipelux-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Swipelux (Svix) signed, whatever the content type
app.post('/webhooks/swipelux', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SWIPELUX_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('SWIPELUX_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = req.headers['svix-id'] ? 'svix' : 'webhook';
  const id = req.headers[`${prefix}-id`];
  const timestamp = req.headers[`${prefix}-timestamp`];
  const signature = req.headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature) {
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
    console.error('Swipelux webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // v3 envelope: { id, type, createdAt, attempt, resource: { type, id }, data: { object, previous } }
  // `id` is the event id: deduplicate on it. `attempt` is NOT a dedupe key or retry counter.
  // `resource` locates the object; `data.object` is its state, `data.previous` the changed fields.
  const type = event.type;
  const resource = event.resource ?? {};
  const object = event.data?.object ?? {};
  console.log(`Received Swipelux webhook ${event.id}: ${type} (${resource.type} ${resource.id})`);

  // Delivery is at least once and may be reordered: persist event.id, return 2xx, then refetch
  // the current resource from the API (e.g. GET /v3/transfers/{id}) before acting on it.
  switch (type) {
    case 'customer.created':
    case 'customer.updated':
    case 'customer.archived':
      console.log(`Customer ${type.split('.')[1]}:`, resource.id);
      break;
    case 'capability.created':
    case 'capability.status_changed':
      console.log(`Capability ${type.split('.')[1]}:`, resource.id, object.status);
      break;
    case 'application.status_changed':
      console.log('Application status changed:', resource.id, object.status);
      break;
    case 'recipient.status_changed':
      console.log('Recipient status changed:', resource.id, object.status);
      break;
    case 'destination.status_changed':
      console.log('Destination status changed:', resource.id, object.status);
      break;
    case 'account.created':
    case 'account.status_changed':
    case 'account.details_changed':
      console.log(`Account ${type.split('.')[1]}:`, resource.id, object.status);
      break;
    case 'transfer.state_changed':
      // data.previous.state is the prior state (transfer: awaiting_funds, processing, action_required,
      // completed, failed, canceled)
      console.log('Transfer state changed:', resource.id, event.data?.previous?.state, '->', object.state);
      break;
    default:
      // Return 2xx for events you don't handle, or Svix keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Swipelux webhook server running on http://localhost:${PORT}/webhooks/swipelux`);
  });
}
