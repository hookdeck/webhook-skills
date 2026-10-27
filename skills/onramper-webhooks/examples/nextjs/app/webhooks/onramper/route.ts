// Generated with: onramper-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyOnramperSignature } from '../../../lib/verify-onramper';

interface OnramperTransaction {
  transactionId?: string;
  transactionType?: string; // 'buy' | 'offramp'
  status?: string;
  [key: string]: unknown;
}

/**
 * Every delivery is a transaction snapshot with no event name, so dispatch on `status`.
 * `transactionType` (buy | offramp) gives the direction.
 */
function handleEvent(tx: OnramperTransaction): void {
  const ref = `${tx.transactionId} (${tx.transactionType})`;
  switch (tx.status) {
    case 'completed':
      console.log(`Transaction completed: ${ref}`);
      // TODO: fulfil the order using tx.outAmount, tx.targetCurrency, tx.transactionHash
      break;

    case 'paid':
      console.log(`Transaction paid: ${ref}`);
      break;

    case 'pending':
      console.log(`Transaction pending: ${ref}`);
      break;

    case 'new':
      console.log(`Transaction created: ${ref}`);
      break;

    case 'failed':
      console.log(`Transaction failed: ${ref}`);
      // TODO: notify the customer or alert support
      break;

    case 'canceled':
      console.log(`Transaction canceled: ${ref}`);
      break;

    default:
      console.log(`Unhandled status: ${tx.status} (${ref})`);
  }
}

export async function POST(request: NextRequest) {
  // Raw bytes, whatever the content type: this is what gets verified.
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const signature = request.headers.get('x-onramper-webhook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
  }
  if (!verifyOnramperSignature(rawBody, signature, process.env.ONRAMPER_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after the signature check.
  let tx: OnramperTransaction;
  try {
    tx = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (tx === null || typeof tx !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    handleEvent(tx);
  } catch (err) {
    console.error('Error handling Onramper webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
