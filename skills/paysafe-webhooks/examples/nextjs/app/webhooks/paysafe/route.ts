import { NextRequest, NextResponse } from 'next/server';
import { verifyPaysafeWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Read the raw body as text - never parse before verifying
  const body = await request.text();
  const signature = request.headers.get('signature');

  if (!body) {
    return NextResponse.json({ error: 'Missing request body' }, { status: 400 });
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing Signature header' }, { status: 400 });
  }

  if (!verifyPaysafeWebhook(body, signature, process.env.PAYSAFE_WEBHOOK_SECRET)) {
    console.error('Paysafe webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`Received ${event.eventName} for ${event.resourceId} (attempt ${event.attemptNumber})`);

  switch (event.eventName) {
    case 'PAYMENT_HANDLE_INITIATED':
    case 'PAYMENT_HANDLE_PROCESSING':
    case 'PAYMENT_HANDLE_PAYABLE':
      console.log('Payment handle update:', event.resourceId);
      break;

    case 'PAYMENT_HANDLE_COMPLETED':
      console.log('Payment handle completed:', event.resourceId);
      // TODO: Create the payment using the handle's paymentHandleToken
      break;

    case 'PAYMENT_HANDLE_FAILED':
      console.log('Payment handle failed:', event.resourceId);
      // TODO: Notify the customer, offer another payment method
      break;

    case 'PAYMENT_COMPLETED':
      console.log('Payment completed:', event.resourceId);
      // TODO: Fulfil the order
      break;

    case 'PAYMENT_FAILED':
    case 'PAYMENT_CANCELLED':
      console.log(`Payment ${event.eventName === 'PAYMENT_FAILED' ? 'failed' : 'cancelled'}:`, event.resourceId);
      // TODO: Release inventory, notify the customer
      break;

    case 'PAYMENT_HELD':
      console.log('Payment held for risk review:', event.resourceId);
      break;

    case 'SETTLEMENT_COMPLETED':
      console.log('Settlement completed:', event.resourceId);
      // TODO: Reconcile the settlement
      break;

    case 'SETTLEMENT_FAILED':
      console.log('Settlement failed:', event.resourceId);
      break;

    default:
      console.log(`Unhandled event: ${event.eventName}`);
  }

  // 2xx acknowledges receipt; 4xx/5xx makes Paysafe retry (up to 3 times)
  return NextResponse.json({ received: true });
}
