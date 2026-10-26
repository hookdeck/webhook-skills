// Generated with: goody-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Goody (Svix) signed, whatever the content type
app.post('/webhooks/goody', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.GOODY_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('GOODY_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Goody webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `event_type`; the order (or order batch) is under `data`
  const type = event.event_type;
  // The svix-id is stable across retries: use it to deduplicate
  console.log(`Received Goody webhook ${id}: ${type}`);

  switch (type) {
    case 'order_batch.created':
    case 'gift_batch.created': // the docs' example payload still shows the older gift_batch.* name
      console.log('Order batch created:', event.data?.id, event.data?.send_status);
      break;
    case 'order_batch.completed':
    case 'gift_batch.completed':
      console.log('Order batch completed:', event.data?.id);
      break;
    case 'order.created':
      // individual_gift_link is the link to send to the recipient
      console.log('Order created:', event.data?.id, event.data?.individual_gift_link);
      break;
    case 'order.gift_opened':
      console.log('Gift opened:', event.data?.id);
      break;
    case 'order.gift_accepted':
      // Final costs are calculated now; is_swapped and cart show what the recipient chose
      console.log('Gift accepted:', event.data?.id, event.data?.is_swapped, event.data?.amounts?.amount_total);
      break;
    case 'order.thank_you_note_added':
      console.log('Thank you note added:', event.data?.id, event.data?.thank_you_note);
      break;
    case 'order.shipped':
      // Emitted when the first shipment is in transit
      console.log('Order shipped:', event.data?.id);
      break;
    case 'order.delivered':
      // Emitted when all shipments are delivered
      console.log('Order delivered:', event.data?.id);
      break;
    case 'order.canceled':
      console.log('Order canceled:', event.data?.id);
      break;
    case 'order.refunded':
      console.log('Order refunded:', event.data?.id);
      break;
    default:
      // Return 200 for events you don't handle, or Goody keeps retrying them
      console.log('Unhandled event type:', type);
  }
  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Goody webhook server running on http://localhost:${PORT}/webhooks/goody`);
  });
}
