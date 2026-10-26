// Generated with: voiceflow-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Voiceflow (Svix) signed, whatever the content type
app.post('/webhooks/voiceflow', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.VOICEFLOW_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('VOICEFLOW_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = req.headers['svix-id'] ? 'svix' : 'webhook';
  const id = req.headers[`${prefix}-id`];
  const timestamp = req.headers[`${prefix}-timestamp`];
  const signature = req.headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature) {
    // The project-level session webhook doesn't send these headers
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
    console.error('Voiceflow webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `type`; the details sit under `data`, and `time` is Unix ms
  const type = event.type;
  const data = event.data || {};
  // The delivery id is stable across retries: use it to deduplicate
  console.log(`Received Voiceflow webhook ${id}: ${type} (${event.resource})`);

  switch (type) {
    case 'organization.project.created':
      console.log('Project created:', data.projectID, data.projectMetadata?.name);
      break;
    case 'organization.project.deleted':
      console.log('Project deleted:', data.projectID, data.projectMetadata?.name);
      break;
    case 'organization.project.environment.created':
      console.log(
        'Environment created:',
        data.createdProjectEnvironmentID,
        'from',
        data.source?.environmentID
      );
      break;
    case 'organization.project.environment.published':
      console.log(
        'Environment published:',
        data.publishedProjectEnvironmentID,
        data.publishedVersionIDBefore,
        '->',
        data.publishedVersionIDAfter
      );
      break;
    case 'organization.project.environment.merged':
      console.log(
        'Environment merged:',
        data.sourceProjectEnvironmentID,
        '->',
        data.targetProjectEnvironmentID,
        'source removed:',
        data.sourceProjectEnvironmentRemoved
      );
      break;
    case 'organization.project.environment.deleted':
      console.log('Environment deleted:', data.deletedProjectEnvironmentID);
      break;
    default:
      // Return 200 for events you don't handle; the documented list may not be exhaustive
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Voiceflow webhook server running on http://localhost:${PORT}/webhooks/voiceflow`);
  });
}
