// Generated with: hirehive-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// HireHive sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.HIREHIVE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('HIREHIVE_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes HireHive signed
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
    console.error('HireHive webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; timestamp?: string; data?: unknown };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body is { type, timestamp, data }: the event name is the top-level `type`, and `timestamp` is ISO 8601
  const type = event.type;
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received HireHive webhook ${id}: ${type}`);

  switch (type) {
    case 'job.created':
      console.log('Job created');
      break;
    case 'job.updated':
      console.log('Job updated');
      break;
    case 'job.status.updated':
      console.log('Job status updated');
      break;
    case 'job.deleted':
      console.log('Job deleted');
      break;
    case 'application.created':
      console.log('Application created');
      break;
    case 'application.stage.updated':
      console.log('Application stage updated');
      break;
    case 'application.deleted':
      console.log('Application deleted');
      break;
    case 'candidate.updated':
      console.log('Candidate updated');
      break;
    case 'candidate.note.created':
      console.log('Candidate note created');
      break;
    case 'candidate.note.updated':
      console.log('Candidate note updated');
      break;
    case 'candidate.note.deleted':
      console.log('Candidate note deleted');
      break;
    case 'candidate.tag.added':
      console.log('Candidate tag added');
      break;
    case 'candidate.tag.removed':
      console.log('Candidate tag removed');
      break;
    case 'feedback.requested':
      console.log('Feedback requested');
      break;
    case 'feedback.submitted':
      console.log('Feedback submitted');
      break;
    case 'feedback.updated':
      console.log('Feedback updated');
      break;
    case 'interview.created':
      console.log('Interview created');
      break;
    case 'interview.updated':
      console.log('Interview updated');
      break;
    case 'interview.cancelled':
      console.log('Interview cancelled');
      break;
    default:
      // The documented list may grow: acknowledge and ignore what you don't handle
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ received: true, type: type ?? null });
}
