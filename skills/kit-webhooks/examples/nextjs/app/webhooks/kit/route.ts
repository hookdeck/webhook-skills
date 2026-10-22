// Generated with: kit-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyKitWebhook } from '../../../lib/kit';

interface KitEvent {
  id: string;
  type: string;
  created: string;
  data: {
    subscriber?: { email_address?: string };
    form?: { name?: string };
    tag?: { name?: string };
  };
}

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing - the signature is over the exact bytes.
  const rawBody = await request.text();
  const header = request.headers.get('x-kit-signature');
  const secret = process.env.KIT_WEBHOOK_SECRET;

  if (!header) {
    return NextResponse.json({ error: 'Missing X-Kit-Signature header' }, { status: 400 });
  }
  if (!secret) {
    console.error('KIT_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!verifyKitWebhook(rawBody, header, secret)) {
    console.error('Kit webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification. The body is an envelope: { delivery_id, events: [...] }.
  let delivery: { delivery_id?: number; events?: KitEvent[] };
  try {
    delivery = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(delivery?.events)) {
    return NextResponse.json({ error: 'Expected an events array' }, { status: 400 });
  }

  // A delivery carries 1-100 events of the same type; always iterate.
  for (const event of delivery.events) {
    const { type, data } = event;
    const email = data?.subscriber?.email_address;
    switch (type) {
      case 'subscriber.created':
        console.log(`Subscriber created: ${email}`);
        break;
      case 'subscriber.activated':
        console.log(`Subscriber activated: ${email}`);
        break;
      case 'subscriber.unsubscribed':
        console.log(`Subscriber unsubscribed: ${email}`);
        break;
      case 'subscriber.bounced':
        console.log(`Subscriber bounced: ${email}`);
        break;
      case 'subscriber.complained':
        console.log(`Subscriber complained (spam report): ${email}`);
        break;
      case 'subscriber.subscribed_to_form':
        console.log(`Subscriber ${email} joined form ${data?.form?.name}`);
        break;
      case 'subscriber.tag_added':
        console.log(`Tag "${data?.tag?.name}" added to ${email}`);
        break;
      case 'subscriber.tag_removed':
        console.log(`Tag "${data?.tag?.name}" removed from ${email}`);
        break;
      default:
        console.log(`Unhandled event type: ${type}`);
    }
    // TODO: persist / forward. Deduplicate on event.id (stable across retries and re-emits),
    // not on delivery_id.
  }

  // Any 2xx acknowledges; non-2xx is retried (8 attempts over ~41 hours).
  return NextResponse.json({ received: true });
}
