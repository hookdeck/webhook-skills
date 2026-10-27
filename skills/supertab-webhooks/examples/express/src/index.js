// Generated with: supertab-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Supertab (Svix) signed, whatever the content type
app.post('/webhooks/supertab', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SUPERTAB_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('SUPERTAB_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Supertab webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `type`, the payload is under `data`. The name carries a version
  // suffix (`purchase.completed_2025-04-01`), but the catalog's own purchase.completed example
  // omits it, so strip the suffix and switch on the base name. There is no event id in the body.
  const rawType = event.type;
  const type = typeof rawType === 'string' ? rawType.replace(/_\d{4}-\d{2}-\d{2}$/, '') : undefined;
  const data = event.data ?? {};
  // `svix-id` is stable across retries of the same message: use it to deduplicate
  console.log(`Received Supertab webhook ${id}: ${rawType}`);

  switch (type) {
    case 'purchase.completed':
      // data: id, offering_id, description, price, user, metadata, entitlement_status, purchased_at, completed_at
      console.log('Purchase completed:', data.id, data.offering_id, data.user?.email, data.price?.amount, data.price?.currency?.code);
      break;
    case 'onetime_offering.purchasing_completed':
      // data: id, status, metadata, price, items[] (each item has its own metadata and purchase)
      // Check `metadata` here before granting access to what the offering represents
      console.log('One-Time Offering purchased:', data.id, data.status, data.items?.length, data.metadata);
      break;
    default:
      // Return 2xx for events you don't handle, or Supertab keeps retrying them
      console.log('Unhandled event type:', rawType);
  }

  res.status(200).json({ success: true, type: rawType });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Supertab webhook server running on http://localhost:${PORT}/webhooks/supertab`);
  });
}
