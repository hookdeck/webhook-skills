// Generated with: stitch-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { Webhook } from 'svix'; // svix 2.x is ESM-only

export const app = express();
const PORT = process.env.PORT || 3000;

// Stitch sends two payload shapes. payment-consent-request, transaction and
// collection carry a top-level `type`. payment, payment.confirmation, refund
// and disbursement are GraphQL-shaped ({ data: { client: { <key>: { node } } } })
// with no `type`, so derive it from the key under data.client.
export function getEventType(event) {
  if (event && typeof event.type === 'string') return event.type;
  const client = event?.data?.client;
  if (client?.paymentInitiationRequests) return 'payment'; // also payment.confirmation
  if (client?.refunds) return 'refund';
  if (client?.disbursements) return 'disbursement';
  return 'unknown';
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Svix signed.
app.post('/webhooks/stitch',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const secret = process.env.STITCH_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('STITCH_WEBHOOK_SECRET is missing or not a whsec_ secret');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing required webhook headers' });
    }

    try {
      // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against
      // every v1 entry in svix-signature, plus a 5-minute timestamp tolerance.
      new Webhook(secret).verify(req.body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      console.error('Stitch webhook verification failed:', err.message);
      const detail = /timestamp/i.test(err.message) ? 'Invalid timestamp' : 'Invalid signature';
      return res.status(400).json({ error: detail });
    }

    // Verified: now it is safe to parse.
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const eventType = getEventType(event);
    const client = event.data?.client;
    console.log(`Received Stitch webhook ${svixId}: ${eventType}`);

    // Process idempotently: Svix may deliver the same message more than once.
    switch (eventType) {
      case 'payment': {
        const node = client.paymentInitiationRequests.node;
        console.log('Payment request update:', {
          id: node?.id,
          externalReference: node?.externalReference,
          state: node?.state?.__typename,
          confirmation: node?.paymentConfirmation?.__typename,
        });
        // TODO: update the order from state / paymentConfirmation
        break;
      }
      case 'payment-consent-request':
        console.log('Consent update:', { id: event.data?.id, status: event.data?.status });
        // TODO: store/revoke the consent (card token, DebiCheck mandate, ...)
        break;
      case 'transaction':
        console.log('Transaction update:', { id: event.data?.id, status: event.data?.status });
        // TODO: mark the recurring charge SUCCESS / FAILURE / CANCELLED
        break;
      case 'collection':
        console.log('Collection update:', { id: event.data?.id, status: event.data?.status });
        // TODO: reconcile the batch collection
        break;
      case 'refund': {
        const node = client.refunds.node;
        console.log('Refund update:', { id: node?.id, status: node?.status?.__typename });
        // TODO: update refund status
        break;
      }
      case 'disbursement': {
        const node = client.disbursements.node;
        console.log('Disbursement update:', { id: node?.id, status: node?.status?.__typename });
        // TODO: update payout status
        break;
      }
      default:
        console.log('Unhandled Stitch event type:', eventType);
    }

    res.status(200).json({ received: true, type: eventType });
  }
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Stitch webhook server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/stitch`);
  });
}
