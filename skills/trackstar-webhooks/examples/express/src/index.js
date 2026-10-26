// Generated with: trackstar-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Trackstar (Svix) signed, whatever the content type
app.post('/webhooks/trackstar', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.TRACKSTAR_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('TRACKSTAR_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Trackstar webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `event_type`; the changed object is `data`, and
  // `connection_id` / `integration_name` say which customer connection it came from
  const { event_type: type, connection_id: connectionId, data, previous_attributes: previous } = event;
  // The delivery id is stable across retries: use it to deduplicate
  console.log(`Received Trackstar webhook ${id}: ${type} (connection ${connectionId})`);

  switch (type) {
    case 'connection.created':
      console.log('Connection created:', connectionId, event.integration_name);
      break;
    case 'connection.deleted':
      console.log('Connection deleted:', connectionId);
      break;
    case 'connection.historical-sync-completed':
      // Resource webhooks are not sent during the initial sync; this marks the point data is queryable
      console.log('Historical sync completed:', connectionId);
      break;
    case 'connection.sync-job-stuck':
      console.log('Sync job stuck:', connectionId);
      break;
    case 'connection-error.created':
      console.log('Connection error created:', connectionId);
      break;
    case 'install.failed':
      console.log('Install failed:', event.integration_name);
      break;
    case 'order.created':
      console.log('Order created:', data?.id, data?.status);
      break;
    case 'order.updated':
      // previous_attributes holds the old values, with dot-joined paths for nested fields
      console.log('Order updated:', data?.id, 'changed:', Object.keys(previous ?? {}));
      break;
    case 'order.shipment.created':
      console.log('Order shipment created:', data?.id);
      break;
    case 'inventory.updated':
      console.log('Inventory updated:', data?.id, 'changed:', Object.keys(previous ?? {}));
      break;
    case 'inbound-shipment.updated':
      console.log('Inbound shipment updated:', data?.id, data?.status);
      break;
    default:
      // Return 200 for events you don't handle, or Svix keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Trackstar webhook server running on http://localhost:${PORT}/webhooks/trackstar`);
  });
}
