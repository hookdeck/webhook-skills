// Generated with: loop-returns-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface LoopWebhookPayload {
  topic?: string;
  trigger?: string;
  id?: string | number;
  [key: string]: unknown;
}

/**
 * Verify the X-Loop-Signature header.
 * Signature: base64(HMAC-SHA256(secret, raw request body))
 */
function verifyLoopSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // Different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw text: the signature covers the exact bytes Loop sent
  const rawBody = await request.text();
  const signature = request.headers.get('x-loop-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Loop-Signature header' }, { status: 400 });
  }

  const secret = process.env.LOOP_WEBHOOK_SECRET;
  if (!secret || !verifyLoopSignature(rawBody, signature, secret)) {
    console.error('Loop webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let payload: LoopWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The trigger (event name) is in the body, not in a header
  console.log(`Received Loop ${payload.topic} webhook: ${payload.trigger}`);

  switch (payload.trigger) {
    case 'return.created':
      console.log('Return created:', payload.id);
      // TODO: Notify support, sync the new return to your OMS/WMS, etc.
      break;

    case 'return.updated':
      console.log('Return updated:', payload.id, 'state:', payload.state);
      // TODO: Sync state changes (open, closed, cancelled, review, expired)
      break;

    case 'return.closed':
      console.log('Return closed:', payload.id);
      // TODO: Finalize the return in your own systems
      break;

    case 'return.processing.failed':
      console.log('Return processing failed:', payload.id);
      // TODO: Alert the team so the return can be retried or handled manually
      break;

    case 'label.created':
      console.log('Label created:', payload.id, payload.carrier, payload.tracking_number);
      // TODO: Store the tracking number, notify the customer, etc.
      break;

    case 'label.updated':
      console.log('Label updated:', payload.id, 'status:', payload.label_status);
      // TODO: Track the shipment status (in_transit, delivered, ...)
      break;

    case 'restock.requested':
      console.log('Restock requested:', payload.id);
      // TODO: Update inventory
      break;

    case 'giftcard.requested':
      console.log('Gift card requested:', payload.id);
      // TODO: Issue the gift card for the exchange
      break;

    case 'shipment.processed':
      console.log('Happy Returns shipment processed:', payload.id);
      // TODO: Update fulfillment records
      break;

    default:
      console.log(`Unhandled trigger: ${payload.trigger}`);
  }

  // Loop expects a 2xx within 10 seconds; failures are retried (5 retries)
  return NextResponse.json({ received: true });
}
