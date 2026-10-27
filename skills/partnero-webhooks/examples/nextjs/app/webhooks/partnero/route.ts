// Generated with: partnero-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPartneroSignature } from '../../../lib/partnero';

export async function POST(request: NextRequest) {
  const secret = process.env.PARTNERO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PARTNERO_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes BEFORE parsing: Partnero signs the exact body (PHP json_encode output)
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('signature');

  if (!verifyPartneroSignature(rawBody, signature, secret)) {
    console.error('Partnero webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { event?: string; data?: Record<string, any> };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // The event type is in the body: { event, url, webhook_key, created_at, data }
  const { event } = payload;
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  switch (event) {
    case 'partner.created':
      console.log(`New partner ${data.id} (${data.email}), status ${data.status}`);
      break;
    case 'transaction.created':
      console.log(`Transaction ${data.key}: ${data.amount} ${data.currency}`);
      break;
    case 'reward.created':
    case 'reward.approved':
    case 'reward.paid':
      console.log(`${event}: reward ${data.id} (${data.amount} ${data.currency})`);
      break;
    default:
      console.log(`Unhandled Partnero event: ${event}`);
  }

  // Acknowledge within 5 seconds; failed deliveries are retried (up to 5 attempts)
  return NextResponse.json({ received: true });
}
