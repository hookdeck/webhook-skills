import { NextRequest, NextResponse } from 'next/server';
import { unwrapWebhook } from '@whop/sdk/helpers';

export async function POST(request: NextRequest) {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('WHOP_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: Whop signs "{webhook-id}.{webhook-timestamp}.{raw body}".
  // Never call request.json() before verifying.
  const payload = await request.text();

  let event: { type: string; data: { id?: string } & Record<string, unknown> };
  try {
    // Verifies the Standard Webhooks signature (HMAC-SHA256, v1,<base64>) and the
    // 5-minute timestamp window. The secret is passed exactly as Whop issued it (ws_...).
    event = unwrapWebhook(payload, {
      headers: Object.fromEntries(request.headers),
      key: secret,
    });
  } catch (err) {
    console.error('Whop signature verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same webhook-id: store it and skip duplicates in production.
  switch (event.type) {
    case 'payment.succeeded':
      console.log('Payment succeeded:', event.data.id);
      break;
    case 'payment.failed':
      console.log('Payment failed:', event.data.id);
      break;
    case 'membership.activated':
      console.log('Membership activated:', event.data.id);
      break;
    case 'membership.deactivated':
      console.log('Membership deactivated:', event.data.id);
      break;
    case 'refund.created':
      console.log('Refund created:', event.data.id);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  // Respond 2xx within 5 seconds or Whop retries.
  return NextResponse.json({ received: true });
}
