// Generated with: gopuff-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { Webhook } from 'svix';

export const app = express();
const PORT = process.env.PORT || 3000;

// Gopuff payloads carry no event-type field, so classify them by shape.
// order.status / order.status.v2 / order.delivered -> { order: {...} }
// Delivery Status -> { driver: {...} }; Delivery ETA -> { expected_delivery_time: {...} }
export function classify(event) {
  if (event?.order && typeof event.order === 'object') return 'order';
  if (event?.driver) return 'delivery_status';
  if (event?.expected_delivery_time) return 'delivery_eta';
  return 'unknown';
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() so the exact raw bytes are verified.
app.post('/webhooks/gopuff', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.GOPUFF_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Svix sends svix-* headers; white-labeled accounts use webhook-*.
  const id = req.headers['svix-id'] || req.headers['webhook-id'];
  const timestamp = req.headers['svix-timestamp'] || req.headers['webhook-timestamp'];
  const signature = req.headers['svix-signature'] || req.headers['webhook-signature'];
  if (!id || !timestamp || !signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Signed content is `${id}.${timestamp}.${rawBody}`; the SDK checks every
    // v1 signature in constant time and enforces a 5-minute timestamp tolerance.
    new Webhook(secret).verify(req.body, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    });
  } catch (err) {
    console.error('Webhook verification failed:', err.message || err);
    const detail = /timestamp/i.test(err?.message || '') ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error: detail });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // svix-id is stable across retries: use it as the idempotency key.
  const kind = classify(event);
  switch (kind) {
    case 'order': {
      const { id: orderId, partner_order_id: partnerOrderId, status, cancel_reason: reason } = event.order;
      console.log('Order status (order.status.v2):', { orderId, partnerOrderId, status });
      if (status === 'Finished') console.log('Order delivered (order.delivered):', partnerOrderId);
      if (status === 'Cancelled') console.log('Order cancelled:', reason);
      break;
    }
    case 'delivery_status':
      console.log('Driver location:', event.driver?.location);
      break;
    case 'delivery_eta':
      console.log('Delivery ETA:', event.expected_delivery_time);
      break;
    default:
      console.log('Unhandled Gopuff payload');
  }

  res.status(200).json({ success: true, kind, svixId: id });
});

export const server = process.env.NODE_ENV === 'test' ? null : app.listen(PORT, () => {
  console.log(`Gopuff webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/gopuff`);
});
