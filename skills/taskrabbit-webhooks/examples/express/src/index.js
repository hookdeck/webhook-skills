// Generated with: taskrabbit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
// svix 2.x is ESM-only, so this example is an ES module ("type": "module")
import { Webhook } from 'svix';

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Taskrabbit webhook endpoint
// Taskrabbit delivers webhooks via Svix, so we verify with the official svix SDK.
// IMPORTANT: use express.raw() so we verify the exact raw body bytes.
app.post('/webhooks/taskrabbit',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const secret = process.env.TASKRABBIT_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Svix sends svix-* headers (white-labeled Svix accounts may send webhook-*).
    // The svix SDK accepts either set, so forward whichever is present.
    const svixId = req.headers['svix-id'] || req.headers['webhook-id'];
    const svixTimestamp = req.headers['svix-timestamp'] || req.headers['webhook-timestamp'];
    const svixSignature = req.headers['svix-signature'] || req.headers['webhook-signature'];
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing required webhook headers' });
    }

    try {
      const wh = new Webhook(secret);
      // Pass the RAW body (Buffer) — never re-serialized JSON. As of svix 2.x
      // verify() returns undefined, so the payload is parsed separately below.
      wh.verify(req.body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      console.error('Webhook verification failed:', err.message || err);
      const msg = (err && err.message) || '';
      const detail = /timestamp/i.test(msg) ? 'Timestamp too old' : 'Invalid signature';
      return res.status(400).json({ error: detail });
    }

    // Verified — only now is it safe to parse.
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Taskrabbit payloads are flat: the event name is in `event` (not `type`),
    // alongside project_uuid, timestamp and optional agreement_external_reference.
    console.log(`Received Taskrabbit webhook: ${event.event} (svix-id ${svixId})`);

    switch (event.event) {
      case 'project.completed':
        console.log('Project completed:', {
          projectUuid: event.project_uuid,
          reference: event.agreement_external_reference,
        });
        // TODO: mark the order fulfilled in your system
        break;
      case 'project.canceled':
        console.log('Project canceled:', {
          projectUuid: event.project_uuid,
          reason: event.cancellation_reason,
        });
        // TODO: release the order / notify the customer
        break;
      case 'project.rescheduled':
        console.log('Project rescheduled:', {
          projectUuid: event.project_uuid,
          from: event.previous_start_time,
          to: event.new_start_time,
        });
        // TODO: update the scheduled start time
        break;
      default:
        console.log('Unhandled event type:', event.event);
    }

    res.status(200).json({ success: true, event: event.event });
  }
);

const server = app.listen(PORT, () => {
  console.log(`Taskrabbit webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/taskrabbit`);
});

export { app, server };
