// Generated with: pinata-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Pinata (Svix) signed, whatever the content type
app.post('/webhooks/pinata', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.PINATA_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('PINATA_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the webhook-* headers (Standard Webhooks); when webhook-id is absent, fall back to the svix-* headers
  const prefix = req.headers['webhook-id'] ? 'webhook' : 'svix';
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
    console.error('Pinata webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `event_type`; the two CAR-import events name it `event` instead.
  // The file sits under data.object (data.new_file for pin_by_cid_succeeded).
  const type = event.event_type ?? event.event;
  // The webhook-id header identifies the message and is stable across retries: use it to deduplicate
  console.log(`Received Pinata webhook ${id}: ${type}`);

  const file = event.data?.object;
  switch (type) {
    case 'ipfs.private.file_added':
    case 'ipfs.public.file_added':
      console.log(`File added (${type.split('.')[1]}):`, file?.id, file?.cid, file?.name);
      break;
    case 'ipfs.private.file_updated':
    case 'ipfs.public.file_updated':
      // data.previous_attributes holds the values that changed
      console.log(`File updated (${type.split('.')[1]}):`, file?.id, event.data?.previous_attributes);
      break;
    case 'ipfs.private.file_deleted':
    case 'ipfs.public.file_deleted':
      console.log(`File deleted (${type.split('.')[1]}):`, file?.id, file?.cid);
      break;
    case 'ipfs.public.car_import_succeeded':
      console.log('CAR import succeeded:', file?.cid, file?.name);
      break;
    case 'ipfs.public.car_import_failed':
      console.log('CAR import failed:', event.data?.file_id, event.data?.error);
      break;
    case 'ipfs.public.pin_by_cid_added':
      console.log('Pin by CID queued:', file?.id, file?.cid, file?.status);
      break;
    case 'ipfs.public.pin_by_cid_succeeded':
      // The pinned file is data.new_file; data.object is the pin request
      console.log('Pin by CID succeeded:', event.data?.new_file?.id, event.data?.new_file?.cid);
      break;
    case 'ipfs.public.pin_by_cid_failed':
      console.log('Pin by CID failed:', file?.id, file?.cid, file?.status);
      break;
    default:
      // Return 200 for events you don't handle, or Pinata (Svix) keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Pinata webhook server running on http://localhost:${PORT}/webhooks/pinata`);
  });
}
