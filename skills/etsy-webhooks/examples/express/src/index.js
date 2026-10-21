// Generated with: etsy-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Map standardwebhooks error messages to stable API responses
function verificationErrorMessage(err) {
  if (err.name !== 'WebhookVerificationError') return 'Webhook verification failed';
  if (err.message === 'No matching signature found') return 'Invalid signature';
  if (err.message.startsWith('Message timestamp')) return 'Timestamp outside tolerance';
  return err.message;
}

function handleEvent(event) {
  // Etsy payloads are thin: fetch event.resource_url with your OAuth token for full data
  switch (event.event_type) {
    case 'order.paid':
      console.log('Order paid:', event.shop_id, event.resource_url);
      break;
    case 'order.canceled':
      console.log('Order canceled:', event.shop_id, event.resource_url);
      break;
    case 'order.shipped':
      console.log('Order shipped:', event.shop_id, event.resource_url);
      break;
    case 'order.delivered':
      console.log('Order delivered:', event.shop_id, event.resource_url);
      break;
    case 'listing.created':
    case 'listing.updated':
    case 'listing.deleted':
      console.log(`${event.event_type}:`, event.listing_id);
      break;
    case 'inventory.created':
    case 'inventory.updated':
    case 'inventory.deleted':
      console.log(`${event.event_type}:`, event.listing_id, event.product_id);
      break;
    case 'inventory.out_of_stock':
      console.log('Product out of stock:', event.listing_id, event.product_id);
      break;
    default:
      console.log('Unhandled event type:', event.event_type);
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Etsy webhook endpoint
// IMPORTANT: express.raw() keeps the exact bytes Etsy signed
app.post('/webhooks/etsy', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.ETSY_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('ETSY_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const headers = {
    'webhook-id': req.headers['webhook-id'],
    'webhook-timestamp': req.headers['webhook-timestamp'],
    'webhook-signature': req.headers['webhook-signature'],
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({
      error: 'Missing required webhook headers (webhook-id, webhook-timestamp, webhook-signature)',
    });
  }

  let event;
  try {
    // Verifies HMAC-SHA256 over "{id}.{timestamp}.{body}" and the 5-minute timestamp window,
    // then returns the parsed JSON body
    event = new Webhook(secret).verify(req.body, headers);
  } catch (err) {
    console.error('Etsy webhook verification failed:', err.message);
    return res.status(400).json({ error: verificationErrorMessage(err) });
  }

  // webhook-id is stable across retries: use it as your idempotency key
  console.log(`Received Etsy webhook ${headers['webhook-id']}: ${event.event_type}`);
  handleEvent(event);

  res.status(200).json({ received: true, event_type: event.event_type });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Etsy webhook server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/etsy`);
  });
}

module.exports = { app };
