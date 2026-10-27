// Generated with: nitrosend-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Nitrosend sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.NITROSEND_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('NITROSEND_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Nitrosend signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(
      rawBody,
      { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature },
      { jsonParse: false },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Nitrosend webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; timestamp?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Every body is { type, timestamp, data }: the event name is the dotted top-level `type`
  // (data.bounce.type is the bounce kind, not the event type)
  const type = event.type;
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  // webhook-id is stable across retries: use it to deduplicate. Order events by event.timestamp.
  console.log(`Received Nitrosend webhook ${id}: ${type}`);
  if (data.test === true) console.log('(test event)');

  switch (type) {
    case 'email.sent':
      console.log('Email sent:', data.message_id, data.to);
      break;
    case 'email.delivered':
      console.log('Email delivered:', data.message_id, data.to);
      break;
    case 'email.bounced':
      console.log('Email bounced:', data.message_id, data.to, data.bounce?.type, data.bounce?.subtype);
      break;
    case 'email.complained':
      console.log('Email marked as spam:', data.message_id, data.to);
      break;
    case 'email.opened':
      console.log('Email opened:', data.message_id, data.to);
      break;
    case 'email.clicked':
      console.log('Email link clicked:', data.message_id, data.to);
      break;
    case 'email.failed':
      console.log('Email failed:', data.message_id, data.to);
      break;
    case 'email.received':
      // A reply or new mail to a brand inbox; text/html are capped at 64 KiB (see data.truncated)
      console.log('Email received:', data.from, '->', data.to, data.subject, `(conversation ${data.conversation_id})`);
      break;
    case 'campaign.completed':
      console.log('Campaign completed');
      break;
    case 'campaign.failed':
      console.log('Campaign failed');
      break;
    case 'campaign.stopped':
      console.log('Campaign stopped: bounce or complaint rate crossed the stop threshold');
      break;
    case 'flow.paused':
      console.log('Flow paused: bounce or complaint rate crossed the pause threshold');
      break;
    case 'sending.paused':
      console.log('Sending paused for the account');
      break;
    case 'sending.limit_approaching':
      console.log('Sending limit approaching');
      break;
    case 'sending.limit_reached':
      console.log('Sending limit reached: sends wait for capacity');
      break;
    case 'import.completed':
      console.log('Contact import completed');
      break;
    case 'import.failed':
      console.log('Contact import failed');
      break;
    case 'domain.verified':
      console.log('Sending domain verified');
      break;
    case 'domain.verification_lost':
      console.log('Sending domain lost verification');
      break;
    case 'domain.dns_degraded':
      console.log('Sending domain DNS degraded: Nitrosend is rechecking');
      break;
    case 'webhook.disabled':
      // Events that occurred while the endpoint was off are not re-sent: reconcile through the API
      console.log('Webhook disabled after 3 days of failed deliveries');
      break;
    default:
      // The documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ received: true, type: type ?? null });
}
