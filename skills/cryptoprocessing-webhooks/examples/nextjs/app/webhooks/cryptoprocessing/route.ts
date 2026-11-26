// Generated with: cryptoprocessing-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyCryptoProcessingSignature } from '../../../lib/cryptoprocessing';

// Callbacks fire on every status change and failed deliveries are retried, so
// remember what was already handled. Use a database or cache in production.
const seen = new Set<string>();

// Key for spotting a repeated callback. Invoices send `pending` again for each partial
// payment and payment requests send `processing` again for each detected transaction,
// so the key includes the `txid`s in `transactions`: a new txid means a new payment.
function callbackKey(event: any): string {
  const id = event.id ?? event.payment_request_id;
  const txids = (Array.isArray(event.transactions) ? event.transactions : [])
    .map((tx: any) => tx && tx.txid)
    .filter(Boolean)
    .sort()
    .join(',');
  return `${event.type}:${id}:${event.status}:${txids}`;
}

// Handle a verified callback, dispatching on the body's `type` field.
// `status` carries the new state (confirmed, not_confirmed, cancelled, pending, paid, ...).
function handleCallback(event: any) {
  switch (event.type) {
    case 'deposit':
      console.log(`Deposit ${event.id} ${event.status}: ${event.currency_received?.amount} ${event.currency_received?.currency}`);
      // Your code: credit the user once status is "confirmed"
      break;

    case 'withdrawal':
      console.log(`Withdrawal ${event.id} ${event.status} (foreign_id ${event.foreign_id})`);
      // Your code: mark the payout as settled or failed
      break;

    case 'exchange':
      console.log(`Exchange ${event.id} ${event.status}: ${event.currency_sent?.currency} -> ${event.currency_received?.currency}`);
      // Your code: update the conversion record
      break;

    case 'payment_request':
      console.log(`Payment request ${event.payment_request_id} ${event.status} (foreign_id ${event.foreign_id})`);
      // Your code: fulfil the order once the request is paid
      break;

    default:
      // deposit_exchange, deposit_wallet_client, withdrawal_exchange,
      // withdrawal_instant, withdrawal_instant_exchange, invoice, and future types
      console.log(`Unhandled CryptoProcessing callback type: ${event.type} (${event.status})`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRYPTOPROCESSING_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CRYPTOPROCESSING_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, whatever the content type - never re-serialize before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-processing-signature');

  if (!verifyCryptoProcessingSignature(rawBody, signature, secret)) {
    console.error('CryptoProcessing signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // A duplicate of an already handled callback: answer 201 to stop its retries
  const key = callbackKey(event);
  if (seen.has(key)) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 201 });
  }

  handleCallback(event);
  seen.add(key);

  // Only HTTP 200 stops delivery
  return NextResponse.json({ received: true });
}
