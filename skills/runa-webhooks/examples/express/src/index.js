// Generated with: runa-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

// product.update events can arrive out of order: keep the newest timestamp per product
// (in-memory for the example; use your database in production)
const lastProductUpdate = new Map();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Runa bodies are bare resources with no event-type field. Each Svix endpoint subscribes to a
// single event type, so identify the event from the payload shape.
export function detectEvent(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if ('product_code' in payload && 'new_state' in payload) return 'product.update';
  if (payload.status === 'COMPLETED' || payload.status === 'FAILED') return 'order.completion';
  return null;
}

// IMPORTANT: express.raw() keeps the exact bytes Runa (Svix) signed, whatever the content type
app.post('/webhooks/runa', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.RUNA_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('RUNA_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Runa webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const event = detectEvent(payload);
  let ignored;

  switch (event) {
    case 'order.completion':
      // The `status` field says which of the two payloads this is
      if (payload.status === 'COMPLETED') {
        // Full order summary: safe to fulfil after reconciling with the Orders API
        console.log('Order completed:', payload.id, payload.completed_at, payload.currency, payload.total_price);
      } else {
        // Failed orders carry only { id, status: 'FAILED' }: look the order up for details
        console.log('Order failed:', payload.id);
      }
      break;
    case 'product.update': {
      // Delivery order isn't guaranteed: discard events older than the last one seen
      const sentAt = Date.parse(payload.timestamp);
      const last = lastProductUpdate.get(payload.product_code);
      if (!Number.isNaN(sentAt) && last !== undefined && sentAt < last) {
        console.log('Ignoring stale product update:', payload.product_code, payload.timestamp);
        ignored = 'stale';
        break;
      }
      if (!Number.isNaN(sentAt)) lastProductUpdate.set(payload.product_code, sentAt);
      const { old_state: before = {}, new_state: after = {} } = payload;
      if (before.is_orderable !== after.is_orderable) {
        // false: disable the product (orders for it are rejected); true: enable it again
        console.log('Product orderability changed:', payload.product_code, after.is_orderable);
      }
      if (before.price_multiplier !== after.price_multiplier) {
        console.log('Product price multiplier changed:', payload.product_code, after.price_multiplier);
      }
      break;
    }
    default:
      // Return 200 for payloads you don't handle, or Svix keeps retrying them
      console.log('Unhandled Runa payload');
  }

  res.status(200).json({ received: true, event, ...(ignored && { ignored }) });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Runa webhook server running on http://localhost:${PORT}/webhooks/runa`);
  });
}
