// Generated with: maxio-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMaxio } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  const sharedKey = process.env.MAXIO_SHARED_KEY;
  if (!sharedKey) {
    console.error('MAXIO_SHARED_KEY not configured');
    return NextResponse.json({ error: 'Webhook verification not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-chargify-webhook-signature-hmac-sha-256');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  // Raw body: the signature covers the exact form-encoded bytes.
  const rawBody = await request.text();
  if (!verifyMaxio(rawBody, signature, sharedKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the form only after verification.
  const form = Object.fromEntries(new URLSearchParams(rawBody));
  const event = form.event;

  switch (event) {
    case 'signup_success':
      console.log('Signup succeeded');
      break;
    case 'payment_success':
      console.log('Payment succeeded');
      break;
    case 'payment_failure':
      console.log('Payment failed');
      break;
    case 'renewal_success':
      console.log('Renewal succeeded');
      break;
    case 'subscription_state_change':
      console.log('Subscription state changed');
      break;
    case 'test':
      console.log('Test webhook received');
      break;
    default:
      console.log('Unhandled event:', event);
  }

  return NextResponse.json({ received: true });
}
