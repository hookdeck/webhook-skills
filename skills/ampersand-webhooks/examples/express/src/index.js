// Generated with: ampersand-webhooks skill
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

// Ampersand sends two kinds of webhook bodies to a webhook destination:
//  - notifications: { notificationType, data }
//  - read / subscribe results: { action, groupRef, objectName, result, resultInfo, ... }
function handleNotification(type, data = {}) {
  switch (type) {
    case 'installation.created':
    case 'installation.updated':
    case 'installation.deleted':
      console.log(`Installation event ${type}:`, { installationId: data.installationId, groupRef: data.groupRef });
      break;
    case 'connection.created':
    case 'connection.refreshed':
    case 'connection.updated':
    case 'connection.deleted':
      console.log(`Connection event ${type}:`, { connectionId: data.connectionId, provider: data.provider });
      break;
    case 'connection.error':
      console.error('Connection error:', { connectionId: data.connectionId, errors: data.errors });
      break;
    case 'read.backfill.done':
    case 'read.triggered.done':
      console.log(`Read finished (${type}):`, { installationId: data.installationId, objectName: data.objectName });
      break;
    case 'read.backfill.error':
    case 'read.triggered.error':
    case 'read.schedule.paused':
      console.error(`Read problem (${type}):`, { installationId: data.installationId, objectName: data.objectName });
      break;
    case 'write.async.done':
      console.log('Async write done:', { installationId: data.installationId, objectName: data.objectName });
      break;
    case 'subscribe.create.success':
    case 'subscribe.update.success':
    case 'subscribe.delete.success':
    case 'subscribe.create.error':
    case 'subscribe.update.error':
    case 'subscribe.delete.error':
      console.log(`Subscribe event ${type}:`, { installationId: data.installationId, objectName: data.objectName });
      break;
    case 'destination.webhook.disabled':
      console.error('Webhook destination disabled:', { destinationId: data.destinationId, url: data.url });
      break;
    case 'destination.delivery.error':
      console.error('Delivery failed:', { destinationId: data.destinationId, error: data.error });
      break;
    default:
      console.log('Unhandled notification type:', type);
  }
}

function handleResult(message) {
  const { action, groupRef, objectName, resultInfo } = message;
  console.log(`Received ${action} result:`, { groupRef, objectName, numRecords: resultInfo?.numRecords });
  if (resultInfo?.type === 'url') {
    // A record over 300KB is not inlined: GET resultInfo.downloadUrl within 15 minutes.
    console.log('Result is too large to inline, download it from resultInfo.downloadUrl');
  } else {
    for (const record of message.result ?? []) {
      // record.fields / record.mappedFields / record.raw (subscribe: record.subscribeEventType)
      console.log('Record:', record.fields?.id ?? record.raw?.id);
    }
  }
}

// IMPORTANT: express.raw({ type: '*/*' }) keeps the exact bytes for any content type,
// which is what the signature covers. Parse the body only after verification.
app.post('/webhooks/ampersand', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.AMPERSAND_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const id = req.headers['svix-id'];
  const timestamp = req.headers['svix-timestamp'];
  const signature = req.headers['svix-signature'];
  if (!id || !timestamp || !signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // The svix library decodes the secret, enforces a fixed 5-minute timestamp window and
    // checks every v1 signature in constant time. As of svix 2.x it returns undefined.
    new Webhook(secret).verify(req.body, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    });
  } catch (err) {
    console.error('Webhook verification failed:', err.message || err);
    const detail = /timestamp/i.test(err.message || '') ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error: detail });
  }

  let message;
  try {
    message = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Dispatch on notificationType when present, otherwise treat it as a read/subscribe result.
  if (typeof message.notificationType === 'string') {
    handleNotification(message.notificationType, message.data);
    return res.status(200).json({ success: true, type: message.notificationType });
  }
  handleResult(message);
  return res.status(200).json({ success: true, type: message.action ?? 'read' });
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Ampersand webhook server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/ampersand`);
  });
}
