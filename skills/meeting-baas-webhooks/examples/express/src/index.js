// Generated with: meeting-baas-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Meeting BaaS (Svix) signed, whatever the content type
app.post('/webhooks/meeting-baas', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.MEETING_BAAS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('MEETING_BAAS_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Meeting BaaS webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Envelope is {event, data}: the event name is the top-level `event`.
  // `extra` echoes what you set on the bot: inside `data` for most events, beside `data` for bot.chat_message.
  const type = event.event;
  const data = event.data ?? {};
  const extra = data.extra ?? event.extra;
  // Deliveries can repeat and arrive out of order: deduplicate on the `svix-id` header.
  console.log(`Received Meeting BaaS webhook ${id}: ${type}`);

  switch (type) {
    case 'bot.status_change':
      // data.status.code is the new status, e.g. in_call_recording; data.status.error_message on failures
      console.log('Bot status:', data.bot_id, data.status?.code, extra);
      break;
    case 'bot.completed':
      // Artifact URLs are presigned and valid for 4 hours: download them promptly
      console.log('Bot completed:', data.bot_id, data.mp4, data.transcription, data.duration_seconds, extra);
      break;
    case 'bot.chat_message':
      // Only participant messages are delivered, not the bot's own
      console.log('Chat message:', data.bot_id, data.sender_name, data.text, extra);
      break;
    case 'bot.failed':
      console.log('Bot failed:', data.bot_id, data.error_code, data.error_message, extra);
      break;
    case 'calendar.connection_created':
      console.log('Calendar connected:', data.calendar_id, data.platform, data.account_email);
      break;
    case 'calendar.connection_updated':
      console.log('Calendar connection updated:', data.calendar_id, data.status);
      break;
    case 'calendar.connection_deleted':
      console.log('Calendar connection deleted:', data.calendar_id);
      break;
    case 'calendar.connection_error':
      console.log('Calendar connection error:', data.calendar_id, data.error);
      break;
    case 'calendar.events_synced':
      console.log('Calendar events synced:', data.calendar_id, data.events_synced, data.sync_type);
      break;
    case 'calendar.event_created':
      console.log('Calendar event created:', data.calendar_id, data.series_id, data.instances?.length);
      break;
    case 'calendar.event_updated':
      console.log('Calendar event updated:', data.calendar_id, data.series_id, data.affected_instances?.length);
      break;
    case 'calendar.event_cancelled':
      console.log('Calendar event cancelled:', data.calendar_id, data.series_id, data.cancelled_instances?.length);
      break;
    default:
      // Return 200 for events you don't handle (the list may not be exhaustive), or Meeting BaaS retries them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Meeting BaaS webhook server running on http://localhost:${PORT}/webhooks/meeting-baas`);
  });
}
