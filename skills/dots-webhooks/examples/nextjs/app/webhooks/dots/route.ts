// Generated with: dots-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Dots delivers through Svix (svix-* headers). Fall back to the Standard Webhooks
// webhook-* names when svix-id is absent, the same way Hookdeck does. Never mix the two sets.
function resolveHeaders(headers: Headers) {
  const prefix = headers.get('svix-id') ? 'svix' : 'webhook';
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signature = headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { id, timestamp, signature };
}

export async function POST(request: Request) {
  const secret = process.env.DOTS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('DOTS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const sig = resolveHeaders(request.headers);
  if (!sig) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Dots (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The values go in under both header-name sets, which the svix library accepts either of.
    new Webhook(secret).verify(rawBody, {
      'svix-id': sig.id,
      'svix-timestamp': sig.timestamp,
      'svix-signature': sig.signature,
      'webhook-id': sig.id,
      'webhook-timestamp': sig.timestamp,
      'webhook-signature': sig.signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Dots webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the body's top-level `event` field. Payloads carry only ids:
  // fetch the resource from the Dots API for its current state.
  const type: string = event.event;
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Dots webhook ${sig.id}: ${type}`);

  switch (type) {
    case 'payment_intent.updated':
      console.log('Payment intent updated:', event.payment_intent_id);
      break;
    case 'payment_method.updated':
      console.log('Payment method updated:', event.payment_method_id);
      break;
    case 'flow.updated':
      console.log('Flow updated:', event.flow_id);
      break;
    case 'dispute.updated':
      console.log('Dispute updated:', event.dispute_id);
      break;
    case 'payout_request.updated':
      console.log('Payout request updated:', event.payout_request_id);
      break;
    case 'organization.updated':
      console.log('Organization updated:', event.organization_id);
      break;
    case 'app.updated':
      console.log('App updated:', event.app_id);
      break;
    case 'transfer.updated':
      console.log('Transfer updated:', event.transfer_id);
      break;
    case 'payout_link.updated':
      console.log('Payout link updated:', event.payout_link_id);
      break;
    case 'user.updated':
      console.log('User updated:', event.user_id);
      break;
    case 'user.onboarded':
      // Sent once per verified bank account
      console.log('User onboarded:', event.user_id, 'bank account:', event.ach_account_id);
      break;
    case 'user.onboarding_revoked':
      console.log('User onboarding revoked:', event.user_id, 'bank account:', event.ach_account_id, 'reason:', event.reason);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  // `api_app_id` is present when an app-originated webhook arrives at an organization-level endpoint
  return NextResponse.json({ success: true, type });
}
