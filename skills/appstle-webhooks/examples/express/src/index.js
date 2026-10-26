// Generated with: appstle-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Appstle (Svix) signed, for any content type
app.post('/webhooks/appstle', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.APPSTLE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('APPSTLE_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature and enforces a fixed 5-minute timestamp window. Retries and
    // replays keep the original timestamp, so see references/verification.md for
    // a manual verifier with no window.
    new Webhook(secret).verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Appstle webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Envelope: { "type": "subscription.created", "data": { ... } }
  const { type, data = {} } = event ?? {};
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Appstle webhook ${svixId}: ${type}`);

  switch (type) {
    case 'subscription.created':
      console.log('Subscription created:', data.id, data.customer?.email);
      break;
    case 'subscription.updated':
      console.log('Subscription updated:', data.id);
      break;
    case 'subscription.activated':
      console.log('Subscription activated:', data.id);
      break;
    case 'subscription.paused':
      console.log('Subscription paused:', data.id);
      break;
    case 'subscription.cancelled':
      console.log('Subscription cancelled:', data.id);
      break;
    case 'subscription.next-order-date-changed':
      console.log('Next order date changed:', data.id, data.nextBillingDate);
      break;
    case 'subscription.billing-interval-changed':
      console.log('Billing interval changed:', data.id, data.billingPolicy);
      break;
    case 'subscription.billing-success':
      console.log('Billing succeeded for contract', data.contractId, 'order', data.orderName);
      break;
    case 'subscription.billing-failure':
      console.log('Billing failed for contract', data.contractId, data.billingAttemptResponseMessage);
      break;
    case 'subscription.billing-skipped':
      console.log('Billing skipped for contract', data.contractId);
      break;
    case 'subscription.upcoming-order-notification':
      console.log('Upcoming order notification for contract', data.contractId);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Appstle webhook server running on http://localhost:${PORT}/webhooks/appstle`);
  });
}
