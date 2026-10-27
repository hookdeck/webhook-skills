// Generated with: junction-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Junction (Svix) signed, whatever the content type
app.post('/webhooks/junction', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.JUNCTION_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('JUNCTION_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Junction webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `event_type`; the payload is under `data`, next to
  // team_id, user_id and client_user_id
  const type = event.event_type;
  const data = event.data ?? {};
  // The delivery id is stable across retries: use it to deduplicate
  console.log(`Received Junction webhook ${id}: ${type}`);

  // Data events are named {daily|historical}.data.{resource}.{created|updated}, one per resource
  const dataEvent = /^(daily|historical)\.data\.(.+)\.(created|updated)$/.exec(type ?? '');

  if (dataEvent) {
    const [, stage, resource, action] = dataEvent;
    if (stage === 'historical') {
      // Data-less: the backfill for this resource finished. Fetch it through the Data Access API
      console.log(`Historical ${resource} backfill complete for ${event.user_id}:`, data.start_date, data.end_date);
    } else {
      // Summaries (sleep, activity, workouts, ...) are at `data` and identified by data.id: the latest
      // version replaces earlier ones. Timeseries (steps, heartrate, glucose, ...) have samples at data.data
      const samples = Array.isArray(data.data) ? data.data.length : undefined;
      console.log(`${resource} ${action}:`, data.id ?? `${samples} samples`, 'from', data.source?.slug);
    }
  } else {
    switch (type) {
      case 'provider.connection.created':
        console.log('Provider connected:', data.source?.slug ?? data.provider?.slug, 'for', event.user_id);
        break;
      case 'provider.connection.error':
        // For example expired credentials: ask the user to reconnect
        console.log('Provider connection error for', event.user_id);
        break;
      case 'provider.device.created':
      case 'provider.device.updated':
        console.log(`Device ${type.split('.')[2]} for`, event.user_id);
        break;
      case 'labtest.order.created':
      case 'labtest.order.updated':
        console.log(`Lab order ${type.split('.')[2]}:`, data.id ?? data.order?.id);
        break;
      case 'labtest.appointment.created':
      case 'labtest.appointment.updated':
        console.log(`Lab appointment ${type.split('.')[2]}:`, data.id ?? data.appointment?.id);
        break;
      case 'labtest.result.critical':
        // A critical value needs urgent clinical attention: alert someone, don't just log
        console.log('Critical lab result:', data.id ?? data.order_id);
        break;
      case 'continuous_query.result_table.changed':
        console.log('Continuous query result table changed for', event.user_id);
        break;
      default:
        // Return 200 for events you don't handle, or Junction keeps retrying them
        console.log('Unhandled event type:', type);
    }
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Junction webhook server running on http://localhost:${PORT}/webhooks/junction`);
  });
}
