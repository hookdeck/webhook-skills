// Generated with: travtus-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.TRAVTUS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('TRAVTUS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Travtus (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Travtus webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Envelope: { event_type, message_id, body }. `message_id` is the Svix message id and `body`
  // is the lease, the task (with a `creator` object) or the AI reply.
  const type: string = event.event_type;
  const body: Record<string, any> = event.body ?? {};
  // `svix-id` is stable across retries of the same message: use it to deduplicate
  console.log(`Received Travtus webhook ${id}: ${type}`);

  switch (type) {
    case 'lease.update':
      console.log('Lease updated:', body.identifier, body.start_date, body.end_date, body.rent);
      break;
    case 'task.create':
    case 'task.update':
    case 'task.delete':
      console.log(`Task ${type.split('.')[1]}:`, body.identifier, body.title, body.status, body.creator?.email);
      break;
    case 'sms.respond':
    case 'email.respond':
    case 'web_chat.respond':
      // AI-generated reply to a message sent through the Messaging API
      console.log(`${type}:`, body.conversation_id, body.channel, body.message_text);
      if (body.human_handover_ind) console.log('Travtus suggests a handover to a human');
      break;
    default:
      // Return 2xx for events you don't handle, or Travtus keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
