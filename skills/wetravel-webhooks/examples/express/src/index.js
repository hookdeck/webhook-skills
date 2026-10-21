// Generated with: wetravel-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { pathToFileURL } from 'node:url';
// svix 2.x is ESM-only and requires Node 22+.
import { Webhook } from 'svix';

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// WeTravel webhook endpoint
// IMPORTANT: use express.raw() so we verify the exact raw body bytes.
app.post('/webhooks/wetravel',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.WETRAVEL_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // WeTravel delivers through Svix (svix-* headers). Accept the Standard
    // Webhooks webhook-* names too — the signing scheme is identical.
    const msgId = req.headers['svix-id'] || req.headers['webhook-id'];
    const timestamp = req.headers['svix-timestamp'] || req.headers['webhook-timestamp'];
    const signature = req.headers['svix-signature'] || req.headers['webhook-signature'];
    if (!msgId || !timestamp || !signature) {
      return res.status(400).json({ error: 'Missing required webhook headers' });
    }

    try {
      // HMAC-SHA256 over `${id}.${timestamp}.${rawBody}` with the base64 key
      // after `whsec_`; checks every v1 signature and a 5-minute timestamp window.
      new Webhook(secret).verify(req.body, {
        'svix-id': msgId,
        'svix-timestamp': timestamp,
        'svix-signature': signature,
      });
    } catch (err) {
      console.error('Webhook verification failed:', err.message || err);
      const detail = /timestamp/i.test(err.message || '') ? 'Timestamp too old' : 'Invalid signature';
      return res.status(400).json({ error: detail });
    }

    // Verified — only now is it safe to parse.
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Svix envelope: { type, data }. Check the exact payload shape for each
    // event in WeTravel's "Manage Webhooks" > Event Catalog.
    const data = event.data || {};
    console.log(`Received WeTravel webhook: ${event.type} (${msgId})`);

    switch (event.type) {
      case 'booking.created':
        console.log('Booking created:', data.id);
        break;
      case 'booking.updated':
        console.log('Booking updated:', data.id);
        break;
      case 'payment.created':
        console.log('Payment created:', data.id);
        break;
      case 'payment.updated':
        console.log('Payment updated:', data.id);
        break;
      case 'transaction.created':
        console.log('Transaction created:', data.id);
        break;
      case 'transaction.updated':
        console.log('Transaction updated:', data.id);
        break;
      case 'trip.published':
        console.log('Trip published:', data.id);
        break;
      case 'lead.created':
        console.log('Lead created:', data.id);
        break;
      case 'lead.updated':
        console.log('Lead updated:', data.id);
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }

    res.status(200).json({ success: true, type: event.type });
  }
);

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`WeTravel webhook server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/wetravel`);
  });
}

export { app };
