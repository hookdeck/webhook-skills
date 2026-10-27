// Generated with: agntix-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Agntix (Svix) signed, whatever the content type
app.post('/webhooks/agntix', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.AGNTIX_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('AGNTIX_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Agntix webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Flat envelope (no `data`): { id, eventType, type, platform, direction, state, agentId, createdAt, metadata, ... }
  // `eventType` is the event name. `type` is the session kind (VOICE | CHAT), NOT the event name.
  // `id` is the session UUID: deduplicate on it (session.created and session.ended share the same id,
  // so key on id + eventType).
  const eventType = event.eventType;
  const sessionVariables = event.metadata?.sessionVariables ?? {};
  console.log(`Received Agntix webhook ${eventType} for session ${event.id} (${event.type} ${event.platform} ${event.direction})`);

  // Delivery is at least once: persist id + eventType, return 2xx, then process asynchronously.
  switch (eventType) {
    case 'session.created':
      // Fired when the session is initiated (for outbound calls, before pickup)
      console.log('Session created:', event.id, event.state, sessionVariables);
      break;
    case 'session.ended':
      // Carries the post-call analysis; some analysis fields appear only if enabled on the agent
      console.log('Session ended:', event.id, event.endedAt, event.analysis?.summary, event.recordingUrl);
      break;
    default:
      // Planned events are not delivered yet. Return 2xx for anything unknown, or Svix keeps retrying
      console.log('Unhandled event type:', eventType);
  }

  res.status(200).json({ success: true, eventType });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Agntix webhook server running on http://localhost:${PORT}/webhooks/agntix`);
  });
}
