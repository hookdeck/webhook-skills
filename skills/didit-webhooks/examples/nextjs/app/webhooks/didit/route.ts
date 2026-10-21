// Generated with: didit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyDiditSignature, toleranceFromEnv } from '../../../lib/didit';

export async function POST(request: NextRequest) {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('DIDIT_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // IMPORTANT: read the raw body with request.text(). Don't call request.json()
  // first — X-Signature is computed over the exact bytes Didit sent.
  const rawBody = await request.text();

  const result = verifyDiditSignature(
    rawBody,
    request.headers.get('x-signature'),
    request.headers.get('x-timestamp'),
    secret,
    toleranceFromEnv()
  );
  if (!result.valid) {
    console.error(`Didit webhook rejected: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // event_id is stable across retries and fan-out: use it as the idempotency key.
  // TODO: skip if event.event_id was already processed.
  console.log(`Verified Didit webhook: ${event.webhook_type} (${event.event_id})`);

  switch (event.webhook_type) {
    case 'status.updated':
      // Session status changed. status is e.g. "Approved", "Declined", "In Review",
      // "Abandoned", "Resubmitted". decision is present for the first four.
      // KYB payloads add session_kind: "business" and business_session_id.
      console.log(
        `Session ${event.session_id} is now ${event.status}` +
          (event.vendor_data ? ` (vendor_data: ${event.vendor_data})` : '')
      );
      break;

    case 'data.updated':
      // Verification data was edited after creation (e.g. manual reviewer correction).
      // trigger may be "manual_review", "manual_step_update" or "ongoing_monitoring".
      console.log(`Session ${event.session_id} data updated (trigger: ${event.trigger || 'n/a'})`);
      break;

    default:
      // Other subscribable events: user.status.updated, transaction.created, etc.
      console.log(`Unhandled Didit event: ${event.webhook_type}`);
  }

  // Respond 2xx quickly; Didit times out after 5 seconds and retries 5xx/404.
  return NextResponse.json({ received: true });
}
