// Generated with: fiber-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Fiber AI delivers through Svix: svix-id, svix-timestamp, svix-signature.
// IMPORTANT: read the raw body (any content type) so we verify the exact bytes.
app.post('/webhooks/fiber-ai',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.FIBER_AI_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (!svixId || !svixTimestamp || !svixSignature || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Missing required webhook headers' });
    }

    try {
      // The svix library decodes the whsec_ secret, checks every v1 signature in
      // constant time and enforces a fixed 5-minute timestamp window. A Hookdeck
      // retry/replay re-sends the ORIGINAL timestamp, so late retries are rejected
      // here; see references/verification.md for a verifier without that window.
      new Webhook(secret).verify(req.body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      console.error('Webhook verification failed:', err.message || err);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Verified: only now is it safe to parse.
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Fiber AI documents no event-type field or header (one endpoint per event type is the
    // reliable way to tell events apart). Read `type` defensively if present; job.changed
    // carries a `profiles` array and is recognised by that shape.
    const type = typeof event.type === 'string'
      ? event.type
      : Array.isArray(event.profiles) ? 'job.changed' : 'unknown';
    console.log(`Received Fiber AI webhook: ${type} (${svixId})`);

    switch (type) {
      case 'reveal.completed':
        console.log('Reveal finished:', { task_id: event.task_id, success: event.success });
        break;
      case 'batch_live_enrich.completed':
        // Reports per-outcome counts (completed / failed / not_found / malformed), no `error`
        console.log('Batch live enrich finished:', { task_id: event.task_id });
        break;
      case 'batch_contact_enrich.completed':
        console.log('Batch contact enrich finished:', { task_id: event.task_id, success: event.success });
        break;
      case 'mosaic.completed':
        console.log('File repair finished:', { task_id: event.task_id, success: event.success });
        break;
      case 'audience.enrichment_completed':
        console.log('Audience enrichment finished:', { audience_id: event.audience_id, success: event.success });
        break;
      case 'tracker.signal_detected':
        // Stable eventId for dedupe; order by occurredAt, not arrival
        console.log('Tracker signal:', { eventId: event.eventId, occurredAt: event.occurredAt });
        break;
      case 'job.changed':
        console.log('Job changes:', { profiles: event.profiles?.length ?? 0 });
        break;
      default:
        console.log('Unhandled event type:', type);
    }

    // Acknowledge fast; do heavy work asynchronously (15 second delivery timeout).
    res.status(200).json({ success: true, type });
  }
);

// svix 2.x is ESM-only, so this example is an ES module ("type": "module").
const server = app.listen(PORT, () => {
  console.log(`Fiber AI webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/fiber-ai`);
});

export { app, server };
