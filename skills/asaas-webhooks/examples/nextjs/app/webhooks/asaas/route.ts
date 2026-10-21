import { NextRequest, NextResponse } from 'next/server';
import { processedEvents, verifyAsaasToken } from '../../../lib/asaas';

export async function POST(request: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken) {
    console.error('ASAAS_WEBHOOK_TOKEN is not set');
    return new NextResponse('Webhook token not configured', { status: 500 });
  }

  if (!verifyAsaasToken(request.headers.get('asaas-access-token'), expectedToken)) {
    return new NextResponse('Invalid asaas-access-token', { status: 401 });
  }

  // Read the raw body; parse JSON only after the token check passes.
  const rawBody = await request.text();

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  if (!body || typeof body.event !== 'string') {
    return new NextResponse('Missing event', { status: 400 });
  }

  // Delivery is at-least-once: skip events whose id we have already processed.
  if (body.id && processedEvents.has(body.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (body.id) processedEvents.add(body.id);

  switch (body.event) {
    case 'PAYMENT_CREATED':
      console.log(`Charge created: ${body.payment?.id}`);
      break;
    case 'PAYMENT_CONFIRMED':
      console.log(`Payment confirmed (balance not yet available): ${body.payment?.id}`);
      break;
    case 'PAYMENT_RECEIVED':
      console.log(`Payment received: ${body.payment?.id} (${body.payment?.value})`);
      break;
    case 'PAYMENT_OVERDUE':
      console.log(`Charge overdue: ${body.payment?.id}`);
      break;
    case 'PAYMENT_REFUNDED':
      console.log(`Charge refunded: ${body.payment?.id}`);
      break;
    case 'SUBSCRIPTION_CREATED':
      console.log(`Subscription created: ${body.subscription?.id}`);
      break;
    case 'TRANSFER_DONE':
      console.log(`Transfer done: ${body.transfer?.id}`);
      break;
    default:
      console.log(`Unhandled event: ${body.event}`);
  }

  // Persist first, respond 200 quickly, and do slow work asynchronously.
  return NextResponse.json({ received: true });
}
