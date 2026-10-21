// Generated with: stytch-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { stytchEventType, type StytchEvent } from '../../../lib/stytch';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.STYTCH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('STYTCH_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Stytch (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature and enforces the 5-minute timestamp window.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Stytch webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: StytchEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = stytchEventType(event);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Stytch webhook ${svixId}: ${type}`);

  // Webhooks are unordered: treat them as a signal and re-fetch from the Stytch API
  switch (type) {
    case 'direct.user.create':
      console.log('User created:', event.id);
      break;
    case 'direct.user.update':
      console.log('User updated:', event.id);
      break;
    case 'direct.organization.create':
    case 'dashboard.organization.create':
      console.log('Organization created:', event.id);
      break;
    case 'direct.member.update':
    case 'scim.member.update':
      console.log('Member updated:', event.id);
      break;
    case 'direct.saml_connection.delete':
      // DELETE events carry only the id, no entity object
      console.log('SAML connection deleted:', event.id);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
