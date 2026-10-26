// Generated with: envoy-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyEnvoySignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  const secret = process.env.ENVOY_CLIENT_SECRET;
  if (!secret) {
    console.error('ENVOY_CLIENT_SECRET is not set - refusing unverified webhooks');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-envoy-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Envoy-Signature header' }, { status: 400 });
  }

  // Raw body: read as text before any JSON parsing, whatever the Content-Type.
  const rawBody = await request.text();

  if (!verifyEnvoySignature(rawBody, signature, secret)) {
    console.error('Envoy webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`✓ Verified Envoy webhook: ${payload?.event ?? 'unknown'}`);

  handleEvent(payload);

  return NextResponse.json({ received: true });
}

function handleEvent(payload: any) {
  // `event` is the topic; `payload` is the entry/invite/etc., `meta` has the location and company.
  // TODO: dedupe (e.g. on event + payload.id); Envoy retries failed deliveries.
  const { event, payload: data, meta } = payload ?? {};
  const attrs = data?.attributes ?? {};
  const who = attrs['full-name'] ?? data?.id;
  const where = meta?.location?.attributes?.name;

  switch (event) {
    // Visitors
    case 'entry_sign_in':
      console.log(`✅ Visitor signed in: ${who} at ${where}`);
      break;
    case 'entry_sign_out':
      console.log(`👋 Visitor signed out: ${who} at ${where}`);
      break;
    case 'entry_blacklist_review':
      console.log(`🔎 Visitor needs blocklist review: ${who}`);
      break;
    case 'entry_blacklist_deny':
      console.log(`⛔ Visitor denied by blocklist: ${who}`);
      break;
    case 'entry_manually_updated':
      console.log(`✏️  Entry manually updated: ${who}`);
      break;
    case 'invite_created':
      console.log(`📨 Invite created: ${who}`);
      break;
    case 'invite_updated':
      console.log(`🔄 Invite updated: ${who}`);
      break;
    case 'invite_removed':
      console.log(`🗑️  Invite removed: ${who}`);
      break;
    case 'upcoming_visit':
      console.log(`⏰ Upcoming visit: ${who}`);
      break;
    case 'qr_code_sent':
      console.log(`📧 QR code sent to: ${who}`);
      break;
    // Workplace
    case 'employee_invite_created':
      console.log(`📨 Employee invite created: ${who}`);
      break;
    case 'employee_invite_updated':
      console.log(`🔄 Employee invite updated: ${who}`);
      break;
    case 'employee_upcoming_visit':
      console.log(`⏰ Employee arriving within the hour: ${who}`);
      break;
    case 'employee_entry_sign_in':
      console.log(`✅ Employee signed in: ${who} at ${where}`);
      break;
    case 'employee_entry_sign_out':
      console.log(`👋 Employee signed out: ${who} at ${where}`);
      break;
    case 'employee_entry_blacklist_review':
      console.log(`🔎 Employee needs blocklist review: ${who}`);
      break;
    case 'employee_entry_blacklist_deny':
      console.log(`⛔ Employee denied by blocklist: ${who}`);
      break;
    case 'location_capacity_updated':
      console.log(`📊 Location capacity updated: ${where}`);
      break;
    case 'desk_sign_in':
      console.log(`🪑 Desk sign-in: ${who}`);
      break;
    case 'ticket_created':
      console.log(`🎫 Workplace ticket created: ${data?.id}`);
      break;
    default:
      console.log(`Unhandled Envoy event: ${event}`);
  }
}
