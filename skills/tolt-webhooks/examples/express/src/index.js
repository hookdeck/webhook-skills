// Generated with: tolt-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Tolt (Svix) signed, whatever the content type
app.post('/webhooks/tolt', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.TOLT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('TOLT_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Tolt webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Every delivery is { type, data, timestamp }. `data` is the API resource plus
  // organization_id; money fields are strings in cents ("980"), so parse before doing math
  const { type, data } = event;
  // The body has no event id: the svix-id header is stable across retries, so deduplicate on it.
  // Order is not guaranteed either: keep the newest version by data.updated_at
  console.log(`Received Tolt webhook ${id}: ${type}`);

  switch (type) {
    case 'partner.created':
      console.log('Partner joined:', data?.id);
      break;
    case 'partner.updated':
      // Also fires when a partner is approved, rejected or suspended
      console.log('Partner updated:', data?.id, data?.status);
      break;
    case 'link.created':
      console.log('Referral link created:', data?.id);
      break;
    case 'link.updated':
      console.log('Referral link updated:', data?.id);
      break;
    case 'customer.created':
      console.log('Referred customer signed up:', data?.id, data?.partner_id);
      break;
    case 'customer.updated':
      console.log('Customer updated:', data?.id, data?.status);
      break;
    case 'transaction.created':
      console.log('Transaction recorded:', data?.id, data?.amount, data?.currency);
      break;
    case 'transaction.updated':
      // Edited or refunded: read the status from the payload
      console.log('Transaction updated:', data?.id, data?.status);
      break;
    case 'commission.created':
      console.log('Commission earned:', data?.id, data?.partner_id, data?.amount, data?.currency);
      break;
    case 'commission.updated':
      // Approved, declined or edited
      console.log('Commission updated:', data?.id, data?.status);
      break;
    default:
      // Return 200 for events you don't handle, or Tolt keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Tolt webhook server running on http://localhost:${PORT}/webhooks/tolt`);
  });
}
