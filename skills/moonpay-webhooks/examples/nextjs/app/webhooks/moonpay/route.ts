// Generated with: moonpay-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMoonpayWebhook } from '../../../lib/moonpay';

interface MoonpayEvent {
  type: string;
  data?: Record<string, any>;
  externalCustomerId?: string;
}

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing - the signature is over the exact bytes, whatever the content type.
  const rawBody = await request.text();
  const header = request.headers.get('moonpay-signature-v2');
  const apiKey = process.env.MOONPAY_WEBHOOK_API_KEY;

  if (!header) {
    return NextResponse.json({ error: 'Missing Moonpay-Signature-V2 header' }, { status: 400 });
  }
  if (!apiKey) {
    console.error('MOONPAY_WEBHOOK_API_KEY is not set');
    return NextResponse.json({ error: 'Webhook API key not configured' }, { status: 500 });
  }
  if (!verifyMoonpayWebhook(rawBody, header, apiKey)) {
    console.error('MoonPay webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification.
  let event: MoonpayEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, data } = event;
  switch (type) {
    case 'transaction_created':
      console.log(`Buy transaction created: ${data?.id} (${data?.status})`);
      break;
    case 'transaction_updated':
      console.log(`Buy transaction updated: ${data?.id} (${data?.status})`);
      break;
    case 'transaction_failed':
      console.log(`Buy transaction failed: ${data?.id} (${data?.failureReason})`);
      break;
    case 'sell_transaction_created':
      console.log(`Sell transaction created: ${data?.id} (${data?.status})`);
      break;
    case 'sell_transaction_updated':
      console.log(`Sell transaction updated: ${data?.id} (${data?.status})`);
      break;
    case 'sell_transaction_failed':
      console.log(`Sell transaction failed: ${data?.id} (${data?.failureReason})`);
      break;
    case 'sell_transaction_requote_required':
      console.log(`Sell transaction needs a requote: ${data?.id}`);
      break;
    case 'identity_check_updated':
      console.log(`Identity check updated: ${data?.id} (${data?.status})`);
      break;
    case 'customer.identity_status_updated': // Platform webhook
      console.log(`Customer ${data?.customerId} identity status: ${data?.status}`);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }
  // TODO: persist / forward. Delivery is at-least-once and unordered: dedupe on type + data.id +
  // data.updatedAt (Platform events also repeat the `webhook-id` header), and use updatedAt
  // rather than arrival order to decide which state is newer.

  // Respond 2xx within 5 seconds; anything else is a failed delivery and is retried.
  return NextResponse.json({ received: true });
}
