// Generated with: holded-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyHoldedSignature } from '../../../lib/holded-signature';

// In-memory idempotency store; use Redis or a database in production.
const processedIds = new Set<string>();

function handleEvent(eventName: string, data: Record<string, any>) {
  switch (eventName) {
    case 'invoice.create':
      console.log('Invoice created:', data?.id);
      break;
    case 'invoice.update':
      console.log('Invoice updated:', data?.id);
      break;
    case 'invoice.approve':
      console.log('Invoice approved:', data?.id);
      break;
    case 'invoice.delete':
      console.log('Invoice deleted:', data?.id);
      break;
    case 'contact.create':
      console.log('Contact created:', data?.id);
      break;
    case 'contact.update':
      console.log('Contact updated:', data?.id);
      break;
    case 'contact.delete':
      console.log('Contact deleted:', data?.id);
      break;
    case 'payment.create':
      console.log('Payment created:', data?.id);
      break;
    case 'payment.update':
      console.log('Payment updated:', data?.id);
      break;
    case 'payment.delete':
      console.log('Payment deleted:', data?.id);
      break;
    case 'stock.update':
      console.log('Stock updated:', data?.id);
      break;
    default:
      // Other document types (creditnote.*, purchase.*, product.*, ...) are
      // acknowledged too: a non-2xx makes Holded retry.
      console.log('Unhandled Holded event:', eventName);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.HOLDED_WEBHOOK_SECRET;
  if (!secret) {
    console.error('HOLDED_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Route handlers don't pre-parse the body: text() gives the exact bytes Holded signed.
  const rawBody = await request.text();

  const result = verifyHoldedSignature(rawBody, request.headers.get('x-holded-webhook-signature'), secret);
  if (!result.valid) {
    console.error(`Holded signature verification failed: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  let data: Record<string, any>;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name travels in a header, alongside the signed body.
  const eventName = request.headers.get('x-holded-webhook-event') || 'unknown';
  const eventId = request.headers.get('x-holded-webhook-id');

  // x-holded-webhook-id is Holded's idempotency key (deliveries are retried).
  if (eventId && processedIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  handleEvent(eventName, data);
  if (eventId) processedIds.add(eventId);

  return NextResponse.json({ received: true });
}
