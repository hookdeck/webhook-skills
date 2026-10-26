// Generated with: trunk-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Trunk (Svix) signed, whatever the content type
app.post('/webhooks/trunk', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.TRUNK_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('TRUNK_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Trunk webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Flat body: the event name is the top-level `type`, next to the resource fields
  // (`test_case`, `repository`, `monitor`, `pr_number`, ...). `timestamp` is an ISO 8601 time: order by
  // it, not by receive time. There is no event id in the body, and no header carries the type.
  const type = event.type;
  // `svix-id` is stable across retries of the same message: use it to deduplicate
  console.log(`Received Trunk webhook ${id}: ${type}`);

  switch (type) {
    // Merge Queue: one event per PR moving through the queue
    case 'pull_request.queued':
    case 'pull_request.submitted':
    case 'pull_request.testing':
    case 'pull_request.pending_failure':
    case 'pull_request.failed':
    case 'pull_request.canceled':
    case 'pull_request.merged':
      console.log(`Merge Queue PR ${event.pr_number} ${type.split('.')[1]}:`, event.status);
      break;
    // Merge Queue: a batch of PRs tested together (subscribe to this family separately)
    case 'pull_request_batch.queued':
    case 'pull_request_batch.submitted':
    case 'pull_request_batch.testing':
    case 'pull_request_batch.pending_failure':
    case 'pull_request_batch.failed':
    case 'pull_request_batch.canceled':
    case 'pull_request_batch.merged':
      console.log(`Merge Queue batch ${type.split('.')[1]}:`, event.status);
      break;
    // Flaky Tests: the v1 event is being phased out in favor of v2.test_case.status_changed
    case 'test_case.status_changed':
    case 'v2.test_case.status_changed':
      console.log(`Test ${event.test_case?.name}: ${event.previous_status} -> ${event.new_status}`);
      break;
    case 'test_case.monitor_status_changed':
      console.log(`Monitor ${event.monitor?.type} ${event.monitor?.status}:`, event.test_case?.name);
      break;
    // Fires only when a setting is manually overridden to ALWAYS_QUARANTINE or NEVER_QUARANTINE
    case 'test_case.quarantining_setting_changed':
    case 'v2.test_case.quarantining_setting_changed':
      console.log('Quarantine setting changed:', event.test_case?.name, event.test_case?.quarantined);
      break;
    case 'test_case.investigation_completed':
      console.log('AI investigation completed:', event.test_case?.name, event.trigger, event.confidence);
      break;
    default:
      // Return 2xx for events you don't handle, or Trunk keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Trunk webhook server running on http://localhost:${PORT}/webhooks/trunk`);
  });
}
