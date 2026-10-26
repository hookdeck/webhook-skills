// Generated with: versive-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Versive (Svix) signed, whatever the content type
app.post('/webhooks/versive', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.VERSIVE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('VERSIVE_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Versive webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `event_type`, beside the `interview` and `study` objects.
  // There is no event id in the body, and no header carries the type.
  const type = event.event_type;
  const interview = event.interview ?? {};
  const study = event.study ?? {};
  // `svix-id` is stable across retries of the same message: use it to deduplicate
  console.log(`Received Versive webhook ${id}: ${type}`);

  switch (type) {
    case 'interview.completed':
      // Sent when a participant completes an interview (screened-out interviews are excluded).
      // The interview can carry transcripts and recordings: treat it as sensitive and log only what you need.
      console.log('Interview completed:', interview.id, 'study', study.id, study.title,
        interview.used_fallback_transcription ? '(fallback transcription)' : '');
      break;
    default:
      // Return 2xx for events you don't handle, or Versive keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Versive webhook server running on http://localhost:${PORT}/webhooks/versive`);
  });
}
