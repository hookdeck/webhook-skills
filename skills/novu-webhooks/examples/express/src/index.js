// Generated with: novu-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Novu (Svix) signed, whatever the content type
app.post('/webhooks/novu', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.NOVU_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('NOVU_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the webhook-* headers; when webhook-id is absent, fall back to the svix-* headers
  const prefix = req.headers['webhook-id'] ? 'webhook' : 'svix';
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
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    });
  } catch (err) {
    console.error('Novu webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Envelope: { id, type, object, timestamp, environmentId, data }.
  // `type` is the event name; top-level `object` is only the resource kind
  // (message | workflow | preference | email_inbound). The resource is `data.object`,
  // and update events add `data.previousObject`.
  const type = event.type;
  const data = event.data ?? {};
  const resource = data.object;
  // The delivery id is stable across retries: use it to deduplicate
  console.log(`Received Novu webhook ${id}: ${type}`);

  switch (type) {
    case 'message.sent':
    case 'message.delivered':
    case 'message.seen':
    case 'message.read':
    case 'message.unread':
    case 'message.archived':
    case 'message.unarchived':
    case 'message.snoozed':
    case 'message.unsnoozed':
    case 'message.deleted':
      // Message fields use Mongo-style names: `_id`, `subscriberId`, `channel`, `status`, ...
      console.log(`Message ${type.split('.')[1]}:`, resource?._id, resource?.subscriberId);
      break;
    case 'message.failed':
      // `data.error` can accompany `object` on message.failed (and message.sent)
      console.log('Message failed:', resource?._id, data.error?.message ?? resource?.errorText);
      break;
    case 'email.received':
      console.log('Inbound email received:', resource?.mail?.subject, 'at', resource?.route?.address);
      break;
    case 'preference.updated':
      // The subscriber is `data.subscriberId`; `data.object` is the updated preference
      console.log('Preference updated:', data.subscriberId, resource?.level, resource?.enabled);
      break;
    case 'workflow.created':
    case 'workflow.updated':
    case 'workflow.published':
    case 'workflow.deleted':
      // workflow.deleted carries the stored workflow (`_id`); the others carry the API shape (`workflowId`)
      console.log(`Workflow ${type.split('.')[1]}:`, resource?.workflowId ?? resource?._id);
      break;
    default:
      // Return 200 for events you don't handle, or Novu keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Novu webhook server running on http://localhost:${PORT}/webhooks/novu`);
  });
}
