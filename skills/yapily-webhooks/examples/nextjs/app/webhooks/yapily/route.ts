import { NextRequest, NextResponse } from 'next/server';
import { verifyYapilyWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Read the raw body as text: parsing JSON first would change the bytes that were signed
  const body = await request.text();
  const signatures = [
    request.headers.get('webhook-signature'),
    request.headers.get('webhook-rotation-signature'),
  ];

  if (!signatures.some(Boolean)) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  if (!verifyYapilyWebhook(body, signatures, process.env.YAPILY_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, type, event } = payload;
  console.log(`Received ${type} (webhook: ${id}, tracingId: ${payload.metadata?.tracingId})`);

  switch (type) {
    case 'single_payment.status.completed':
      console.log(`Payment ${event?.id} completed`);
      // TODO: Mark the payment as settled in your system
      break;

    case 'single_payment.status.updated':
      console.log(`Payment ${event?.id} status: ${event?.status}`);
      // TODO: Handle COMPLETED or FAILED
      break;

    case 'single_payment.iso_status.updated':
      console.log(`Payment ${event?.id} ISO status: ${event?.statusDetails?.isoStatus?.code}`);
      // TODO: Track ISO 20022 status transitions
      break;

    case 'hosted_pis.payment_status.completed.v1':
      console.log(`Hosted payment ${event?.paymentRequestId} completed`);
      // TODO: Fulfil the order
      break;

    case 'hosted_pis.payment_status.failed.v1':
      console.log(`Hosted payment ${event?.paymentRequestId} failed`);
      // TODO: Notify the customer / offer retry
      break;

    default:
      // Other event categories (for example async data-access completion) land here
      console.log(`Unhandled event type: ${type}`);
  }

  // Yapily expects a 200 within 1 second
  return NextResponse.json({ received: true });
}
