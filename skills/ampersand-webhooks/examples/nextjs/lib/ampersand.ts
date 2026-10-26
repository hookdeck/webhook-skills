// Generated with: ampersand-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { Webhook } from 'svix';

export type VerifyResult = { valid: boolean; error?: string; status?: number };

// Ampersand delivers through Svix: svix-id, svix-timestamp, svix-signature.
export function verifyAmpersandWebhook(rawBody: string, headers: Headers, secret: string | undefined): VerifyResult {
  if (!secret || !secret.startsWith('whsec_')) {
    return { valid: false, error: 'Server configuration error', status: 500 };
  }
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signature = headers.get('svix-signature');
  if (!id || !timestamp || !signature) {
    return { valid: false, error: 'Missing required webhook headers', status: 400 };
  }
  try {
    // Decodes the secret, enforces a fixed 5-minute timestamp window and checks every v1
    // entry in constant time. As of svix 2.x it returns undefined.
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    });
    return { valid: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    return { valid: false, error: /timestamp/i.test(msg) ? 'Timestamp too old' : 'Invalid signature', status: 400 };
  }
}

// Notifications: { notificationType, data }
export function handleNotification(type: string, data: Record<string, any> = {}): void {
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

// Read / subscribe results: { action, groupRef, objectName, result, resultInfo, ... }
export function handleResult(message: Record<string, any>): void {
  const { action, groupRef, objectName, resultInfo } = message;
  console.log(`Received ${action} result:`, { groupRef, objectName, numRecords: resultInfo?.numRecords });
  if (resultInfo?.type === 'url') {
    // A record over 300KB is not inlined: GET resultInfo.downloadUrl within 15 minutes.
    console.log('Result is too large to inline, download it from resultInfo.downloadUrl');
    return;
  }
  for (const record of message.result ?? []) {
    // record.fields / record.mappedFields / record.raw (subscribe: record.subscribeEventType)
    console.log('Record:', record.fields?.id ?? record.raw?.id);
  }
}
