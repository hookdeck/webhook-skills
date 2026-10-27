// Generated with: airweave-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Airweave (Svix) signed, whatever the content type
app.post('/webhooks/airweave', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.AIRWEAVE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('AIRWEAVE_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Airweave webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Flat body: the event name is the top-level `event_type`, and the ids sit beside it.
  // The body has no event id: deduplicate on the svix-id header, which is stable across retries.
  // Deliveries are not ordered, so don't let a late sync.running overwrite a sync.completed.
  const type = event.event_type;
  console.log(`Received Airweave webhook ${id}: ${type}`);

  switch (type) {
    case 'sync.pending':
      // A sync job was created and queued
      console.log('Sync queued:', event.collection_readable_id, event.source_type, event.sync_job_id);
      break;
    case 'sync.running':
      console.log('Sync running:', event.collection_readable_id, event.source_type, event.sync_job_id);
      break;
    case 'sync.completed':
      // Entity and chunk counts are present on this event only
      console.log('Sync completed:', event.collection_name, `${event.entities_inserted ?? 0} inserted, ${event.entities_updated ?? 0} updated, ${event.entities_deleted ?? 0} deleted`);
      break;
    case 'sync.failed':
      // `error` carries the reason (for example an expired auth token)
      console.log('Sync failed:', event.collection_name, event.error ?? 'Unknown error');
      break;
    case 'sync.cancelled':
      console.log('Sync cancelled:', event.collection_readable_id, event.sync_job_id);
      break;
    case 'source_connection.created':
      // The connection may not be authenticated yet (OAuth not finished): check is_authenticated
      console.log('Source connection created:', event.source_type, event.source_connection_id, event.is_authenticated);
      break;
    case 'source_connection.auth_completed':
      console.log('Source connection authenticated:', event.source_type, event.source_connection_id);
      break;
    case 'source_connection.deleted':
      console.log('Source connection deleted:', event.source_type, event.source_connection_id);
      break;
    case 'collection.created':
      console.log('Collection created:', event.collection_readable_id, event.collection_name);
      break;
    case 'collection.updated':
      console.log('Collection updated:', event.collection_readable_id, event.collection_name);
      break;
    case 'collection.deleted':
      console.log('Collection deleted:', event.collection_readable_id);
      break;
    default:
      // Return 200 for events you don't handle, or Airweave keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Airweave webhook server running on http://localhost:${PORT}/webhooks/airweave`);
  });
}
