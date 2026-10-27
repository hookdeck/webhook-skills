// Generated with: tensorlake-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Tensorlake (Svix) signed, whatever the content type
app.post('/webhooks/tensorlake', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.TENSORLAKE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('TENSORLAKE_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Tensorlake webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `event_type`; the payload is under `data`.
  // The envelope also has event_id (evt_..., stable across retries: deduplicate on it), event_version,
  // occurred_at, project_id, source_id, source_revision and source_ordinal.
  const type = event.event_type;
  const data = event.data ?? {};
  console.log(`Received Tensorlake webhook ${event.event_id ?? id}: ${type}`);
  // Delivery is at-least-once and unordered: dedupe on event_id, and order related events from the same
  // source_id by Number(source_revision) then source_ordinal.

  switch (type) {
    case 'tensorlake.sandbox.created':
    case 'tensorlake.sandbox.running':
    case 'tensorlake.sandbox.suspended':
    case 'tensorlake.sandbox.resumed':
    case 'tensorlake.sandbox.terminated':
      console.log(`Sandbox ${type.split('.')[2]}:`, data.sandbox?.id, data.previous_status, '->', data.sandbox?.status);
      break;
    case 'tensorlake.sandbox.failed':
      console.log('Sandbox failed:', data.sandbox?.id, data.sandbox?.outcome_reason);
      break;
    case 'tensorlake.application.created':
    case 'tensorlake.application.updated':
    case 'tensorlake.application.deleted':
      console.log(`Application ${type.split('.')[2]}:`, data.application?.name, data.application?.version);
      break;
    case 'tensorlake.application.request.created':
    case 'tensorlake.application.request.completed':
      console.log(`Application request ${type.split('.')[3]}:`, data.application?.name, data.request?.id);
      break;
    case 'tensorlake.application.request.failed':
      console.log('Application request failed:', data.application?.name, data.request?.id, data.request?.failure_reason);
      break;
    default:
      // Return 2xx for events you don't handle, or Tensorlake keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Tensorlake webhook server running on http://localhost:${PORT}/webhooks/tensorlake`);
  });
}
