import { NextRequest, NextResponse } from 'next/server';
import { verifyOxapaySignature } from '../../../lib/oxapay';

// Handle a verified OxaPay callback. There is no event name: each callback is
// the transaction's current state, so dispatch on `status`.
// `type` is the flow: invoice, white_label, static_address, payment_link,
// donation (payments) or payout.
function handleOxapayCallback(event: any) {
  switch (event.status) {
    case 'Paying':
      console.log(`Payment ${event.track_id} (${event.type}) paying: awaiting network confirmation`);
      // TODO: Mark the order as payment in progress; do NOT deliver goods yet
      break;

    case 'Paid':
      console.log(`Payment ${event.track_id} (${event.type}) paid: ${event.amount} ${event.currency}`);
      // TODO: Fulfil the order (look it up by event.order_id)
      break;

    case 'Confirming':
      console.log(`Payout ${event.track_id} confirming, tx ${event.tx_hash}`);
      // TODO: Mark the payout as sent and awaiting confirmation
      break;

    case 'Confirmed':
      console.log(`Payout ${event.track_id} confirmed, tx ${event.tx_hash}`);
      // TODO: Mark the payout as completed
      break;

    case 'Failed':
      console.log(`Payout ${event.track_id} failed`);
      // TODO: Alert and release or retry the payout
      break;

    default:
      console.log(`Unhandled OxaPay status: ${event.status}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.OXAPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OXAPAY_WEBHOOK_SECRET is not configured');
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  // Raw bytes, exactly as received, whatever the content type
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyOxapaySignature(rawBody, request.headers.get('hmac'), secret)) {
    console.error('OxaPay webhook signature verification failed');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  // Parse only after verification
  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Retries resend the same callback: de-duplicate on track_id + status.
  handleOxapayCallback(event);

  // OxaPay counts a delivery as successful only with HTTP 200 and body "ok"
  return new NextResponse('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
