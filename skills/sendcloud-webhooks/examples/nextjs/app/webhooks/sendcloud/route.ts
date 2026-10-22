// Generated with: sendcloud-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Sendcloud signs the entire raw body: HMAC-SHA256, bare hex, Sendcloud-Signature header
function verifySendcloudSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.SENDCLOUD_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SENDCLOUD_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('sendcloud-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Sendcloud-Signature header' }, { status: 400 });
  }

  // Read the raw bytes: never parse before verifying, whatever the content type
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifySendcloudSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  switch (event.action) {
    case 'parcel_status_changed':
      // Webhooks can arrive out of order: compare event.timestamp before overwriting state
      console.log(`Parcel ${event.parcel?.id} -> ${event.parcel?.status?.message}`);
      break;
    case 'return_created':
      console.log(`Return ${event.data?.id} created for order ${event.data?.order_number}`);
      break;
    case 'integration_connected':
    case 'integration_updated':
    case 'integration_deleted':
      console.log(`${event.action}: integration ${event.integration?.id}`);
      break;
    default:
      console.log(`Unhandled action: ${event.action}`);
  }

  return NextResponse.json({ received: true });
}
