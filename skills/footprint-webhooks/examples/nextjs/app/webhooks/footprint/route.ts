// Generated with: footprint-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.FOOTPRINT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('FOOTPRINT_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Footprint (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Footprint webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is in the body's `event_kind` field
  const type: string = event.event_kind;
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Footprint webhook ${svixId}: ${type}`);

  switch (type) {
    case 'footprint.onboarding.completed':
      console.log('Onboarding completed:', event.fp_id, event.status, 'manual review:', event.requires_manual_review);
      break;
    case 'footprint.onboarding.incomplete':
      console.log('Onboarding incomplete:', event.fp_id, event.onboarding_id);
      break;
    case 'footprint.onboarding.status_changed':
      // Deprecated by Footprint in favor of onboarding.completed and user.manual_review
      console.log('Onboarding status changed:', event.fp_id, event.new_status);
      break;
    case 'footprint.watchlist_check.completed':
      console.log('Watchlist check completed:', event.fp_id, event.status, event.error);
      break;
    case 'footprint.user.manual_review':
      // Call GET /users/{fp_id} for the user's new status
      console.log('Manual review changed status:', event.fp_id);
      break;
    case 'footprint.user.info_requested':
      console.log('More information requested from user:', event.fp_id);
      break;
    case 'footprint.user.bank_link_updated':
      console.log('Bank link updated:', event.link_id, event.link_state);
      break;
    case 'footprint.vault.updated':
      console.log('Vault updated:', event.fp_id, event.fields);
      break;
    case 'footprint.entity.entity_status_set':
      console.log('Entity status set:', event.fp_id, event.status);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
