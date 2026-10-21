// Generated with: zernio-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyZernioWebhook } from '@/lib/verify';

// Event ids already handled. Use a database or cache with a unique index in production.
const processedEvents = new Set<string>();

export async function POST(request: NextRequest) {
  // Raw body is required for signature verification
  const body = await request.text();
  const signature =
    request.headers.get('x-zernio-signature') ?? request.headers.get('x-late-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature provided' }, { status: 401 });
  }

  if (!verifyZernioWebhook(body, signature, process.env.ZERNIO_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Zernio delivers at least once: payload.id (= X-Zernio-Event-Id) is stable across retries
  if (processedEvents.has(payload.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  processedEvents.add(payload.id);

  console.log(`Received ${payload.event} event (id: ${payload.id})`);

  switch (payload.event) {
    case 'webhook.test':
      console.log('Test event:', payload.message);
      break;

    case 'post.scheduled':
      console.log(`Post ${payload.post?.id} scheduled for ${payload.post?.scheduledFor}`);
      break;

    case 'post.published':
      console.log(`Post ${payload.post?.id} published`);
      // TODO: Store platforms[].publishedUrl, notify the author, etc.
      break;

    case 'post.partial':
      console.log(`Post ${payload.post?.id} published on some platforms only`);
      // TODO: Retry the failed targets
      break;

    case 'post.failed':
      console.log(`Post ${payload.post?.id} failed on every platform`);
      // TODO: Alert the author, inspect platforms[].errorCategory
      break;

    case 'post.platform.published':
      console.log(`Post ${payload.post?.id} published on one platform`);
      break;

    case 'post.platform.failed':
      console.log(`Post ${payload.post?.id} failed on one platform`);
      break;

    case 'message.received':
      console.log(`Message on ${payload.message?.platform}: ${payload.message?.text}`);
      // TODO: Route to support, reply via the inbox API
      break;

    case 'comment.received':
      console.log(`Comment received on account ${payload.account?.accountId}`);
      break;

    case 'account.connected':
      console.log(`Account connected: ${payload.account?.platform} @${payload.account?.username}`);
      break;

    case 'account.disconnected':
      console.log(`Account disconnected (${payload.account?.disconnectionType}): ${payload.account?.reason}`);
      // TODO: Prompt the user to reconnect
      break;

    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  // Return 2xx within 5 seconds; do heavy work in the background
  return NextResponse.json({ received: true });
}
