// Generated with: fireblocks-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyFireblocksWebhook } from '../../../lib/verify';

// Signature verification needs Node crypto and the raw body — use the Node.js runtime.
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const signature = request.headers.get('fireblocks-webhook-signature');
  if (!signature) {
    return new NextResponse('Missing Fireblocks-Webhook-Signature header', { status: 400 });
  }

  // Read the RAW body bytes — do not JSON.parse before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());

  let event: Record<string, any>;
  try {
    event = await verifyFireblocksWebhook(rawBody, signature);
  } catch (err) {
    console.error('Fireblocks webhook verification failed:', (err as Error).message);
    return new NextResponse('Invalid signature', { status: 400 });
  }

  // Dispatch on `eventType`; the resource is in `event.data`.
  switch (event.eventType) {
    case 'transaction.created':
      console.log('Transaction created:', event.data?.id ?? event.resourceId);
      // Your code: record the pending transaction
      break;

    case 'transaction.status.updated':
      console.log(
        'Transaction status updated:',
        event.data?.id ?? event.resourceId,
        '->',
        event.data?.status
      );
      // Your code: update settlement state; credit balances on COMPLETED
      break;

    case 'transaction.approval_status.updated':
      console.log('Transaction approval status updated:', event.data?.id ?? event.resourceId);
      // Your code: notify approvers / gate release of funds
      break;

    default:
      console.log(`Unhandled event type: ${event.eventType}`);
  }

  // Acknowledge quickly. Fireblocks expects a 200; do heavy work async.
  return NextResponse.json({ received: true });
}
