// Generated with: stream-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { decodeBody, verifyStreamWebhook } from '../../../lib/stream';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-signature');
  const webhookId = request.headers.get('x-webhook-id');
  const apiKey = request.headers.get('x-api-key');

  // Read the raw bytes (not request.json()) so the signature can be verified
  let body: Buffer;
  try {
    body = decodeBody(Buffer.from(await request.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: 'Invalid body encoding' }, { status: 400 });
  }

  if (!verifyStreamWebhook(body, signature, process.env.STREAM_API_SECRET)) {
    console.error('Stream webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Optional sanity check that the call is for your app
  if (process.env.STREAM_API_KEY && apiKey !== process.env.STREAM_API_KEY) {
    return NextResponse.json({ error: 'Unexpected API key' }, { status: 400 });
  }

  // Parse only after verification
  let event: any;
  try {
    event = JSON.parse(body.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // X-Webhook-Id is stable across retries: use it to dedupe
  console.log(`Received ${event.type} (webhook id: ${webhookId})`);

  switch (event.type) {
    case 'message.new':
      console.log(`New message in ${event.cid}:`, event.message?.text);
      break;
    case 'message.updated':
      console.log(`Message updated: ${event.message?.id}`);
      break;
    case 'message.deleted':
      console.log(`Message deleted: ${event.message?.id}`);
      break;
    case 'reaction.new':
      console.log(`Reaction ${event.reaction?.type} on ${event.message?.id}`);
      break;
    case 'channel.created':
      console.log(`Channel created: ${event.cid}`);
      break;
    case 'user.updated':
      console.log(`User updated: ${event.user?.id}`);
      break;
    case 'member.added':
      console.log(`Member added: ${event.member?.user_id} to ${event.cid}`);
      break;
    default:
      // Stream adds event types over time; don't fail on unknown ones
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
