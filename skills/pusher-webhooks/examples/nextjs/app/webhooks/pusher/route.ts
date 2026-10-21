// Generated with: pusher-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';

// Fields per event name, from the Pusher docs (the SDK's Event type only covers some of them)
interface PusherEvent {
  name: string;
  channel: string;
  user_id?: string;
  event?: string;
  data?: string;
  socket_id?: string;
  subscription_count?: number;
}

export async function POST(request: NextRequest) {
  // Raw body is required: the signature covers the exact bytes Pusher sent
  const rawBody = await request.text();

  // The SDK throws on a missing signature, so reject absent headers first
  if (!request.headers.get('x-pusher-key') || !request.headers.get('x-pusher-signature')) {
    return NextResponse.json({ error: 'Missing Pusher signature headers' }, { status: 400 });
  }

  const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.PUSHER_APP_KEY!,
    secret: process.env.PUSHER_APP_SECRET!,
    cluster: process.env.PUSHER_CLUSTER || 'mt1',
  });

  // The SDK checks X-Pusher-Key, the HMAC-SHA256 hex digest in X-Pusher-Signature
  // and that the content type is application/json. Header names are already lower-case.
  const webhook = pusher.webhook({
    headers: Object.fromEntries(request.headers),
    rawBody,
  });

  if (!webhook.isValid()) {
    console.error('Pusher webhook verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // With batch webhooks enabled, one request can carry many events
  for (const event of webhook.getEvents() as PusherEvent[]) {
    switch (event.name) {
      case 'channel_occupied':
        console.log(`Channel occupied: ${event.channel}`);
        break;
      case 'channel_vacated':
        console.log(`Channel vacated: ${event.channel}`);
        break;
      case 'member_added':
        console.log(`Member ${event.user_id} joined ${event.channel}`);
        break;
      case 'member_removed':
        console.log(`Member ${event.user_id} left ${event.channel}`);
        break;
      case 'client_event':
        console.log(`Client event ${event.event} on ${event.channel} from ${event.socket_id}`);
        break;
      case 'cache_miss':
        console.log(`Cache miss on ${event.channel}`);
        break;
      case 'subscription_count':
        console.log(`Subscription count on ${event.channel}: ${event.subscription_count}`);
        break;
      default:
        console.log(`Unhandled Pusher event: ${event.name}`);
    }
  }

  return NextResponse.json({ received: true });
}
