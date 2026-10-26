// Generated with: fiber-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

type FiberEvent = Record<string, unknown> & { type?: string; profiles?: unknown[] };

export async function POST(request: Request) {
  const secret = process.env.FIBER_AI_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body (any content type); do not JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    // The svix library decodes the whsec_ secret, checks every v1 signature in
    // constant time and enforces a fixed 5-minute timestamp window. Hookdeck
    // retries/replays resend the ORIGINAL timestamp, so late retries are rejected;
    // see references/verification.md for a verifier without that window.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Verified: only now is it safe to parse.
  let event: FiberEvent;
  try {
    event = JSON.parse(rawBody) as FiberEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Fiber AI documents no event-type field or header (one endpoint per event type is the
  // reliable way to tell events apart). Read `type` defensively if present; job.changed
  // carries a `profiles` array and is recognised by that shape.
  const type =
    typeof event.type === 'string'
      ? event.type
      : Array.isArray(event.profiles)
        ? 'job.changed'
        : 'unknown';
  console.log(`Received Fiber AI webhook: ${type} (${svixId})`);

  switch (type) {
    case 'reveal.completed':
      console.log('Reveal finished:', { task_id: event.task_id, success: event.success });
      break;
    case 'batch_live_enrich.completed':
      // Reports per-outcome counts (completed / failed / not_found / malformed), no `error`
      console.log('Batch live enrich finished:', { task_id: event.task_id });
      break;
    case 'batch_contact_enrich.completed':
      console.log('Batch contact enrich finished:', { task_id: event.task_id, success: event.success });
      break;
    case 'mosaic.completed':
      console.log('File repair finished:', { task_id: event.task_id, success: event.success });
      break;
    case 'audience.enrichment_completed':
      console.log('Audience enrichment finished:', { audience_id: event.audience_id, success: event.success });
      break;
    case 'tracker.signal_detected':
      // Stable eventId for dedupe; order by occurredAt, not arrival
      console.log('Tracker signal:', { eventId: event.eventId, occurredAt: event.occurredAt });
      break;
    case 'job.changed':
      console.log('Job changes:', { profiles: event.profiles?.length ?? 0 });
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  // Acknowledge fast; do heavy work asynchronously (15 second delivery timeout).
  return NextResponse.json({ success: true, type }, { status: 200 });
}
