// Generated with: paynow-gg-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPaynowSignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw bytes for verification; parse the body only after the check
  const rawBody = Buffer.from(await request.arrayBuffer());

  const result = verifyPaynowSignature(
    rawBody,
    request.headers.get('paynow-timestamp'),
    request.headers.get('paynow-signature'),
    process.env.PAYNOW_WEBHOOK_SECRET,
    Number(process.env.PAYNOW_WEBHOOK_TOLERANCE_SECONDS) || 0
  );
  if (!result.valid) {
    console.error(`PayNow webhook rejected: ${result.error}`);
    const status = result.error === 'Webhook secret not configured' ? 500 : 401;
    return NextResponse.json({ error: result.error }, { status });
  }

  let event: { event_id?: string; event_type?: string; body?: Record<string, any> };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Deduplicate on event.event_id in production: PayNow retries any non-2xx response
  switch (event.event_type) {
    case 'ON_ORDER_COMPLETED':
      console.log(`Order completed: ${event.body?.id}`);
      break;
    case 'ON_PAYMENT_COMPLETED':
      console.log(`Payment completed: ${event.body?.id} (${event.body?.amount} ${event.body?.currency})`);
      break;
    case 'ON_PAYMENT_FAILED':
      console.log(`Payment failed: ${event.body?.id}`);
      break;
    case 'ON_REFUND':
      console.log(`Refund completed: ${event.body?.id}`);
      break;
    case 'ON_SUBSCRIPTION_RENEWED':
      console.log(`Subscription renewed: ${event.body?.id}`);
      break;
    case 'ON_DELIVERY_ITEM_ADDED':
      console.log(`Delivery item added: ${event.body?.id}`);
      break;
    default:
      console.log(`Unhandled PayNow event: ${event.event_type}`);
  }

  return NextResponse.json({ received: true });
}
