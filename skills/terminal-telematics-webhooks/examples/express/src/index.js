// Generated with: terminal-telematics-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Terminal (via Svix) signed, whatever the content type
app.post('/webhooks/terminal-telematics', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.TERMINAL_TELEMATICS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('TERMINAL_TELEMATICS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = req.headers['svix-id'] ? 'svix' : 'webhook';
  const id = req.headers[`${prefix}-id`];
  const timestamp = req.headers[`${prefix}-timestamp`];
  const signature = req.headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature) {
    // Deliveries from Terminal always carry svix-* (or webhook-*) signature headers
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
    console.error('Terminal webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!event || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `type`; the related entities sit under `detail`
  const type = typeof event?.type === 'string' ? event.type : undefined;
  const detail = event?.detail ?? {};
  const action = type?.split('.')[1];
  // The delivery id (svix-id) is stable across retries: use it to deduplicate
  console.log(`Received Terminal webhook ${id}: ${type} (${event?.id})`);

  switch (type) {
    case 'connection.created':
    case 'connection.completed':
    case 'connection.reconnected':
    case 'connection.updated':
      console.log(`Connection ${action}:`, detail.connection?.id, detail.connection?.provider?.code);
      break;
    case 'connection.disconnected':
      // Credentials stopped working: the user has to re-authenticate through Link
      console.log('Connection disconnected:', detail.connection?.id);
      break;
    case 'connection.pending_deletion':
    case 'connection.deleted':
      console.log(`Connection ${action}:`, detail.connection?.id);
      break;
    case 'sync.requested':
    case 'sync.started':
      console.log(`Sync ${action}:`, detail.sync?.id, 'connection', detail.connection?.id);
      break;
    case 'sync.completed':
    case 'connection.first_sync_completed':
      // Data is ready to read. For S3/data deliveries wait for delivery.completed instead
      console.log(`${type}:`, detail.sync?.id, 'connection', detail.connection?.id);
      break;
    case 'sync.failed':
      console.log('Sync failed:', detail.sync?.id, detail.sync?.failureReason);
      break;
    case 'delivery.requested':
    case 'delivery.started':
    case 'delivery.completed':
    case 'delivery.failed':
      console.log(`Delivery ${action}:`, detail.delivery?.id, 'destination', detail.destination?.id);
      break;
    case 'issue.reported':
    case 'issue.resolved':
      console.log(`Issue ${action}:`, detail.issue?.id, detail.issue?.status, 'connection', detail.connection?.id);
      break;
    case 'provider.availability_updated':
      // Not tied to a connection: every subscribed application receives it for every provider
      console.log('Provider availability updated:', detail.provider?.code, detail.availability?.current);
      break;
    case 'unsupported_provider.requested':
      console.log('Unsupported provider requested:', detail.provider);
      break;
    case 'vehicle.added':
    case 'vehicle.modified':
    case 'vehicle.removed':
      console.log(`Vehicle ${action}:`, detail.vehicle?.id, 'connection', detail.connection?.id);
      break;
    case 'driver.added':
    case 'driver.modified':
    case 'driver.removed':
      console.log(`Driver ${action}:`, detail.driver?.id, 'connection', detail.connection?.id);
      break;
    case 'trailer.added':
    case 'trailer.modified':
    case 'trailer.removed':
      console.log(`Trailer ${action}:`, detail.trailer?.id, 'connection', detail.connection?.id);
      break;
    case 'safety_event.added':
    case 'safety_event.modified':
      console.log(`Safety event ${action}:`, detail.safetyEvent?.id, 'connection', detail.connection?.id);
      break;
    case 'link.analytics_event_emitted':
      // Link flow telemetry; most apps ignore it
      break;
    default:
      // Return 200 for events you don't handle, or Terminal keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Terminal webhook server running on http://localhost:${PORT}/webhooks/terminal-telematics`);
  });
}
