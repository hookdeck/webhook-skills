// Generated with: svix-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

type SvixEvent = { type: string; data: Record<string, unknown> };

export async function POST(request: Request) {
  const secret = process.env.SVIX_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Svix sends svix-* headers; Standard Webhooks senders may use webhook-*.
  const svixId = request.headers.get('svix-id') ?? request.headers.get('webhook-id');
  const svixTimestamp =
    request.headers.get('svix-timestamp') ?? request.headers.get('webhook-timestamp');
  const svixSignature =
    request.headers.get('svix-signature') ?? request.headers.get('webhook-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body — do not JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    const wh = new Webhook(secret);
    // As of svix 2.x verify() returns undefined, so the payload is parsed below.
    wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    const detail = /timestamp/i.test(msg) ? 'Timestamp too old' : 'Invalid signature';
    console.error('Webhook verification failed:', err);
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  // Verified — only now is it safe to parse.
  let event: SvixEvent;
  try {
    event = JSON.parse(rawBody) as SvixEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Events are defined by the upstream sender; envelope is { type, data }.
  console.log(`Received Svix webhook: ${event.type}`);

  switch (event.type) {
    case 'invoice.paid':
      console.log('Invoice paid:', { id: event.data.id });
      break;
    case 'user.created':
      console.log('User created:', { id: event.data.id });
      break;
    case 'user.updated':
      console.log('User updated:', { id: event.data.id });
      break;
    case 'message.sent':
      console.log('Message sent:', { id: event.data.id });
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  return NextResponse.json({ success: true, type: event.type }, { status: 200 });
}
