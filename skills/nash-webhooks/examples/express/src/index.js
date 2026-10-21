// Generated with: nash-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');

// svix 2.x is ESM-only, so load it with a dynamic import (cached after the
// first call). This works from CommonJS on any Node version and under Jest.
let webhookClass;
async function getWebhookClass() {
  if (!webhookClass) {
    ({ Webhook: webhookClass } = await import('svix'));
  }
  return webhookClass;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Nash delivers webhooks through Svix. Every request carries svix-id,
// svix-timestamp and svix-signature, and the signature covers the RAW body,
// so mount express.raw() on this route (not express.json()).
app.post('/webhooks/nash', express.raw({ type: '*/*' }), async (req, res) => {
  const secret = process.env.NASH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('NASH_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: 'Missing Svix signature headers' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  const Webhook = await getWebhookClass();

  try {
    // verify() checks HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{raw body}"
    // against every "v1,<sig>" entry and rejects timestamps more than 5 minutes
    // off. In svix 2.x it returns nothing, so the body is parsed below.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Nash webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Verified: only now is it safe to parse.
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Envelope: { type, event, data }. type is the entity (delivery, task,
  // courier_location, courier_name, shift); event is the status within it.
  const { type, event, data } = payload;
  const eventType = `${type}.${event}`;

  // svix-id is the same on every retry of a message: use it to deduplicate.
  console.log(`Received Nash webhook ${eventType} (${svixId})`);

  switch (eventType) {
    case 'delivery.created':
    case 'delivery.assigned_driver':
      console.log('Delivery progressing:', { jobId: data?.id, event });
      break;
    case 'delivery.dropoff_complete':
      console.log('Delivery completed:', { jobId: data?.id });
      break;
    case 'delivery.canceled_by_provider':
    case 'delivery.failed':
      console.log('Delivery did not complete:', { jobId: data?.id, event });
      break;
    case 'task.created':
      // A new task (delivery attempt) on the job, e.g. after a reassignment.
      console.log('Task created:', { jobId: data?.id });
      break;
    case 'task.canceled_by_provider':
    case 'task.failed':
      // Terminal for this task only; the job may continue on another task.
      console.log('Task ended:', { jobId: data?.id, event });
      break;
    case 'courier_location.updated':
    case 'courier_name.updated':
      console.log('Courier update:', { jobId: data?.id, event });
      break;
    case 'shift.dispatched':
      console.log('Shift dispatched:', {
        createdJobIds: data?.created_job_ids,
        errors: data?.errors,
      });
      break;
    default:
      console.log('Unhandled Nash event:', eventType);
  }

  res.status(200).json({ received: true, type: eventType });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Nash webhook server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/nash`);
  });
}

module.exports = { app };
