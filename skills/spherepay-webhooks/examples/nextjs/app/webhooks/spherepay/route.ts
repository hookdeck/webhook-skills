// Generated with: spherepay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifySpherePay } from '../../../lib/spherepay';

// SpherePay makes ONE attempt per event (no automatic retries) and expects a 2xx within 15 seconds.
export async function POST(request: NextRequest) {
  const secret = process.env.SPHEREPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SPHEREPAY_WEBHOOK_SECRET is not set');
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  // Raw bytes are required: the signature covers exactly what SpherePay sent
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifySpherePay(rawBody, request.headers, secret)) {
    console.error('SpherePay webhook signature verification failed');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let event: { id?: string; type?: string; sequence?: number; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return new NextResponse('Invalid payload', { status: 400 });
  }

  // Delivery is at-least-once and unordered: dedupe on event.id, compare event.sequence for staleness
  const data = event.data ?? {};
  switch (event.type) {
    case 'customer.created':
    case 'customer.pending':
      console.log(`Customer ${data.id} (${event.type}): ${data.status}`);
      break;
    case 'customer.approved':
      console.log(`Customer approved: ${data.id} (profile ${data.verificationProfile})`);
      break;
    case 'customer.rejected':
      console.log(`Customer rejected: ${data.id} (profile ${data.verificationProfile})`);
      break;
    case 'transfer.created':
    case 'transfer.pendingFunding':
    case 'transfer.pendingReview':
    case 'transfer.fundsReceived':
    case 'transfer.processing':
      console.log(`Transfer ${data.id} (${event.type}): ${data.previousStatus} -> ${data.status}`);
      break;
    case 'transfer.succeeded':
      console.log(`Transfer succeeded: ${data.id} for customer ${data.customerId}`);
      break;
    case 'transfer.returned':
    case 'transfer.refunded':
    case 'transfer.failed':
      console.log(`Transfer ${data.id} (${event.type}): ${data.previousStatus} -> ${data.status}`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
