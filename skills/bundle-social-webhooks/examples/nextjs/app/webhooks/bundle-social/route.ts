// Generated with: bundle-social-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { Bundlesocial, type WebhookEvent } from 'bundlesocial';

// The SDK verifies with Node's crypto module, so use the Node.js runtime.
export const runtime = 'nodejs';

// The official SDK. Webhook verification only needs the signing secret; the
// API key is used by the SDK's API methods, not by webhooks.constructEvent().
const bundle = new Bundlesocial(process.env.BUNDLE_SOCIAL_API_KEY || '');

export async function POST(request: NextRequest) {
  // Read the raw body - bundle.social signs the exact bytes it sends:
  // x-signature = hex HMAC-SHA256(rawBody, secret)
  const body = await request.text();
  const signature = request.headers.get('x-signature');
  const secret = process.env.BUNDLE_SOCIAL_WEBHOOK_SECRET;

  if (!signature || !secret) {
    console.error('bundle.social webhook missing x-signature header or secret');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: WebhookEvent;
  try {
    // Throws "Invalid signature" on mismatch; returns the parsed { type, data } event.
    event = bundle.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error('bundle.social webhook signature verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // bundle.social may add event types at any time (webhooks with no event
  // filter receive them), so treat `type` as an open string and ignore unknowns.
  const type: string = event.type;
  const data: any = event.data;

  switch (type) {
    case 'post.published':
      // Fires for successes AND permanent failures - check data.status.
      if (data.status === 'POSTED') {
        console.log(`Post ${data.id} is live`, data.externalData);
      } else {
        console.log(`Post ${data.id} failed (${data.status}):`, data.error ?? data.errors);
      }
      break;
    case 'post.externally-deleted':
      console.log(`Post ${data.postId ?? data.id} was deleted on ${data.socialAccountType}`);
      break;
    case 'comment.published':
      console.log(`Comment ${data.id} finished with status ${data.status}`);
      break;
    case 'social-account.created':
      console.log(`Social account connected: ${data.type} @${data.username}`);
      break;
    case 'social-account.updated': {
      // socialAction is present for disconnection checks and failed token refreshes
      const deleteOn = data.socialAction?.details?.deleteOn;
      console.log(`Social account updated: ${data.id}` + (deleteOn ? ` - reconnect before ${deleteOn}` : ''));
      break;
    }
    case 'social-account.deleted':
      console.log(`Social account removed: ${data.id}`);
      break;
    case 'team.created':
      console.log(`Team created: ${data.name} (${data.id})`);
      break;
    case 'team.updated':
      console.log(`Team updated: ${data.id}`);
      break;
    case 'team.deleted':
      console.log(`Team deleted: ${data.id}`);
      break;
    default:
      console.log(`Unhandled bundle.social event type: ${type}`);
  }

  // Respond 2xx within 15 seconds; move slow work to a queue.
  return NextResponse.json({ received: true });
}
