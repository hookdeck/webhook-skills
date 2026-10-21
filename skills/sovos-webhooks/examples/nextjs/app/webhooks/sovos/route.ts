// Generated with: sovos-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Sovos Indirect Tax API notification (subset of fields).
type SovosNotification = {
  eventType: string;
  notificationId: string;
  correlationId?: string;
  createdDate?: number;
  appPrefix?: string;
  contentUrl?: string;
  orgId?: string;
  metadata?: {
    documentId?: string;
    erpDocumentId?: string;
    erpSystemId?: string;
    processType?: string;
    sciResponseCode?: string;
    [key: string]: unknown;
  };
};

export async function POST(request: Request) {
  const secret = process.env.SOVOS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: Svix signs the exact bytes it sends.
  const rawBody = await request.text();

  try {
    // Checks the whsec_ secret, the 5-minute timestamp window, and every v1
    // signature. In svix 2.x verify() returns undefined; parse after it passes.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('Webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let notification: SovosNotification;
  try {
    notification = JSON.parse(rawBody) as SovosNotification;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
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

  return NextResponse.json({ received: true, eventType }, { status: 200 });
}
