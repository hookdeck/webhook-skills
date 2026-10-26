// Generated with: origami-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.ORIGAMI_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ORIGAMI_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the webhook-* headers; when webhook-id is absent, fall back to the svix-* headers
  const prefix = request.headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Origami signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library reads the webhook-* names, so hand it the resolved values under those names.
    new Webhook(secret).verify(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Origami webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Envelope: { type, id, timestamp, data }. `id` equals the webhook-id header and is stable
  // across retries: use it to deduplicate. `timestamp` is the event time, not the dispatch time.
  const type: string = event.type;
  const data = event.data ?? {};
  console.log(`Received Origami webhook ${id}: ${type}`);

  switch (type) {
    case 'job.succeeded':
    case 'job.failed':
    case 'job.cancelled':
    case 'job.needs_input':
      // One shape for all four. Ignore an event whose `sequence` is not greater than the last one
      // you processed for this `job_id`. `metadata` echoes what you passed when admitting the Job.
      console.log(`Job ${type.split('.')[1]}:`, data.job_id, data.operation, `seq ${data.sequence}`, data.metadata);
      if (type === 'job.failed') console.error('Job error:', data.error?.code, data.error?.message);
      if (type === 'job.needs_input') console.log('Needs input:', data.needs_input?.questions ?? data.needs_input?.handoff);
      break;
    case 'table.run.completed':
      console.log('Table run completed:', data.run_id, data.table_id, data.status, data.counts, data.failure_reason);
      break;
    case 'sequence.message.sent':
      // Branch on data.channel ("email" | "linkedin")
      console.log('Message sent:', data.channel, data.sequence_id, data.campaign_id, data.sender?.id, data.message?.provider_id);
      break;
    case 'sequence.reply.received':
      console.log('Reply received:', data.channel, data.sequence_id, data.campaign_id, 'newly_stopped:', data.newly_stopped);
      break;
    case 'sequence.connection.requested':
    case 'sequence.connection.accepted':
      console.log(`LinkedIn connection ${type.split('.')[2]}:`, data.sequence_id, data.campaign_id, data.outreach_target?.linkedin_slug);
      break;
    case 'sequence.comment.posted':
      console.log('LinkedIn comment posted:', data.sequence_id, data.campaign_id, data.comment?.post_url);
      break;
    case 'webhook.test':
      // Always delivered, regardless of subscription: a wire-connectivity check
      console.log('Test event:', data.triggered_by, data.message);
      break;
    default:
      // Return 200 for events you don't handle: other 4xx are dropped, 408/429/5xx are retried
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
