// Generated with: chargeblast-webhooks skill
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

// Chargeblast sends svix-* headers; Hookdeck also accepts the Standard Webhooks webhook-* names
function readSignatureHeaders(headers) {
  const prefix = headers['svix-id'] ? 'svix' : 'webhook';
  return {
    id: headers[`${prefix}-id`],
    timestamp: headers[`${prefix}-timestamp`],
    signature: headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Chargeblast (Svix) signed, whatever the content type
app.post('/webhooks/chargeblast', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CHARGEBLAST_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('CHARGEBLAST_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { id, timestamp, signature } = readSignatureHeaders(req.headers);
  if (!id || !timestamp || !signature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(req.body, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Chargeblast webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The body has no envelope and no type field: the event type is in the X-Event-Type header
  const type = req.headers['x-event-type'];
  // The svix-id is stable across retries: use it to deduplicate
  console.log(`Received Chargeblast webhook ${id}: ${type}`);

  switch (type) {
    case 'alert.created':
      // externalOrder is not set yet on alert.created; wait for alert.updated if you need it
      console.log('Alert created:', payload.id, payload.subprovider, payload.amount, payload.currency);
      break;
    case 'alert.updated':
      console.log('Alert updated:', payload.id, payload.externalOrder);
      break;
    case 'alert.refunded':
      // Can follow alert.created closely when the alert arrives already resolved
      console.log('Alert refunded:', payload.id, payload.amount, payload.currency);
      break;
    case 'alert.matched':
      console.log('Alert matched to a charge:', payload.id, payload.externalOrder);
      break;
    case 'alert.will_expire':
      // Sent at most once per alert, about 46-48 hours before it expires (Ethoca and CDRN)
      console.log('Alert will expire soon:', payload.id);
      break;
    case 'alert.within_refund_rules':
      // Not deduplicated, and a later refund can still fail: handle repeats idempotently
      console.log('Alert within refund rules:', payload.id);
      break;
    case 'deflection.created':
      // Deflection body: `type` is the product (CE or FPT), not the event type
      console.log('Deflection created:', payload.id, payload.type, payload.status);
      break;
    case 'deflection.updated':
      console.log('Deflection updated:', payload.id, payload.status, payload.fees);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Chargeblast webhook server running on http://localhost:${PORT}/webhooks/chargeblast`);
  });
}
