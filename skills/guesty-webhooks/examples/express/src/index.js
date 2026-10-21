// Generated with: guesty-webhooks skill
// https://github.com/hookdeck/webhook-skills

import dotenv from 'dotenv';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Guesty webhook endpoint (delivered and signed by Svix)
// IMPORTANT: use express.raw() so we verify the exact raw body bytes.
app.post('/webhooks/guesty',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.GUESTY_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({
        error: 'Missing required webhook headers (svix-id, svix-timestamp, svix-signature)'
      });
    }

    try {
      // The SDK decodes the whsec_ secret, checks every v1 signature in
      // constant time, and enforces a 5-minute timestamp tolerance.
      // As of svix 2.x verify() returns undefined; the body is parsed below.
      new Webhook(secret).verify(req.body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      console.error('Webhook verification failed:', err.message || err);
      const detail = /timestamp/i.test((err && err.message) || '')
        ? 'Invalid timestamp'
        : 'Invalid signature';
      return res.status(400).json({ error: detail });
    }

    // Verified — only now is it safe to parse.
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Guesty puts the event name in `event` (not `type`). Deduplicate on
    // svix-id and meta.eventId (when present) before doing real work.
    const eventName = event.event;
    console.log(`Received Guesty webhook: ${eventName}`, {
      svixId,
      eventId: event.meta?.eventId,
    });

    switch (eventName) {
      case 'reservation.created.v2':
        console.log('Reservation created:', { reservationId: event.data?.reservationId });
        break;
      case 'reservation.updated.v2':
        console.log('Reservation updated:', {
          reservationId: event.data?.reservationId,
          changedFields: event.meta?.changedFields,
          subType: event.meta?.subType,
        });
        break;
      case 'reservation.new':
        console.log('Reservation created (legacy):', { reservationId: event.reservation?._id });
        break;
      case 'reservation.updated':
        console.log('Reservation updated (legacy):', { reservationId: event.reservation?._id });
        break;
      case 'listing.new':
        console.log('Listing created:', { listingId: event.listing?._id });
        break;
      case 'listing.updated':
        console.log('Listing updated:', { listingId: event.listing?._id });
        break;
      case 'listing.removed':
        console.log('Listing removed:', { listingId: event.listing?._id });
        break;
      case 'guest.created':
        console.log('Guest created:', { guestId: event.guest?._id });
        break;
      case 'payments.received':
        console.log('Payment received:', {
          reservationId: event.payment?.reservationId,
          amount: event.payment?.amount,
          currency: event.payment?.currency,
        });
        break;
      default:
        console.log('Unhandled event:', eventName);
    }

    // Respond quickly (Guesty expects 2xx within ~15s); fetch fresh data from
    // the Open API asynchronously if you need the full object.
    res.status(200).json({ received: true, event: eventName });
  }
);

// Only listen when run directly (tests import the app without starting a server)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Guesty webhook server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/guesty`);
  });
}

export { app };
