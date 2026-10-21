// Generated with: sovos-webhooks skill
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

// Sovos delivers Indirect Tax API notifications through Svix.
// IMPORTANT: express.raw() keeps the exact bytes Svix signed.
app.post('/webhooks/sovos',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.SOVOS_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing required webhook headers' });
    }

    try {
      // The SDK decodes the whsec_ secret, checks the 5-minute timestamp window,
      // and compares every v1 signature in constant time. In svix 2.x verify()
      // returns undefined, so the body is parsed after it passes.
      new Webhook(secret).verify(req.body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      console.error('Webhook verification failed:', err.message);
      const error = /timestamp/i.test(err.message || '') ? 'Timestamp too old' : 'Invalid signature';
      return res.status(400).json({ error });
    }

    let notification;
    try {
      notification = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Sovos puts the event name in the top-level eventType field.
    // notificationId (or svix-id) is a good idempotency key: Svix retries deliveries.
    const { eventType, notificationId, metadata = {} } = notification;
    console.log(`Received Sovos webhook: ${eventType} (${notificationId})`);

    switch (eventType) {
      case 'document.received':
        console.log('Document received:', {
          documentId: metadata.documentId,
          erpDocumentId: metadata.erpDocumentId,
          sciResponseCode: metadata.sciResponseCode,
        });
        // TODO: update the ERP document status; fetch notification.contentUrl if needed
        break;
      case 'document.completed':
      case 'workflow.completed':
        console.log('Document processing completed:', { documentId: metadata.documentId });
        // TODO: mark the invoice final and store legal attachments
        break;
      case 'system.error':
        console.error('Sovos system error:', { documentId: metadata.documentId });
        // TODO: alert and flag the document for review
        break;
      default:
        console.log('Unhandled event type:', eventType);
    }

    res.status(200).json({ received: true, eventType });
  }
);

const server = app.listen(PORT, () => {
  console.log(`Sovos webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/sovos`);
});

export { app, server };
