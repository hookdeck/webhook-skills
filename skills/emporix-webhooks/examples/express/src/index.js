// Generated with: emporix-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

// Emporix documents each event's payload schema but not an envelope, and Svix sends no
// event-type header. Use `eventType` from the body if present, otherwise from the
// `?eventType=` query string on the endpoint URL registered in the Svix dashboard.
export function getEventType(body, query = {}) {
  if (body && typeof body.eventType === 'string') return body.eventType;
  return typeof query.eventType === 'string' ? query.eventType : null;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw({ type: '*/*' }) keeps the exact bytes Svix signed for any content type
app.post('/webhooks/emporix', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.EMPORIX_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('EMPORIX_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    // v1, signature and enforces a fixed 5-minute timestamp window.
    new Webhook(secret).verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Emporix webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = getEventType(body, req.query);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Emporix webhook ${svixId}: ${eventType ?? '(unknown event type)'}`);

  switch (eventType) {
    case 'order.created':
      console.log('Order created:', body.id, body.status);
      break;
    case 'order.updated':
      console.log('Order updated:', body.id, body.status);
      break;
    case 'customer.created':
      console.log('Customer created:', body.customerNumber, body.contactEmail);
      break;
    case 'product.created':
      console.log('Product created:', body.id, body.code);
      break;
    case 'product.updated':
      console.log('Product updated:', body.id, body.code);
      break;
    case null:
      // No event type available: register one Svix endpoint per event with ?eventType=...
      console.log('Event type unknown; payload keys:', Object.keys(body ?? {}));
      break;
    default:
      console.log('Unhandled event type:', eventType);
  }

  res.status(200).json({ success: true, eventType });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Emporix webhook server running on http://localhost:${PORT}/webhooks/emporix`);
  });
}
