import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export async function POST(request: NextRequest) {
  const secret = process.env.POSTHOG_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'POSTHOG_WEBHOOK_SECRET is not set' }, { status: 500 });
  }

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json(
      { error: 'Missing webhook-id, webhook-timestamp or webhook-signature header' },
      { status: 400 }
    );
  }

  // CRITICAL: read the raw body as text; do not parse JSON before verifying
  const rawBody = await request.text();

  let payload: any;
  try {
    // PostHog signs `${id}.${timestamp}.${rawBody}` with HMAC-SHA256 (Standard Webhooks).
    // The library enforces a fixed 5-minute timestamp window.
    payload = new Webhook(secret).verify(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('PostHog signature verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Default body: { event: { event, uuid, distinct_id, properties, timestamp, ... }, person: {...} }
  const event = payload?.event;
  switch (event?.event) {
    case '$pageview':
      console.log('Pageview:', event.distinct_id, event.properties?.$current_url);
      break;
    case '$identify':
      console.log('Identify:', event.distinct_id);
      break;
    case '$autocapture':
      console.log('Autocapture:', event.distinct_id);
      break;
    default:
      // Custom events arrive under their own names, e.g. "signed_up"
      console.log('Event:', event?.event);
  }

  return NextResponse.json({ received: true });
}
