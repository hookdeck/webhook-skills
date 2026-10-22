// Generated with: propelauth-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { parsePropelAuthEvent } from '../../../lib/propelauth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.PROPELAUTH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('PROPELAUTH_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes PropelAuth (Svix) signed
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
    console.error('PropelAuth webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, data } = parsePropelAuthEvent(body);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received PropelAuth webhook ${svixId}: ${type}`);

  switch (type) {
    case 'user.created':
      console.log('New user signed up:', data.user_id);
      break;
    case 'user.updated':
      // Only the ID is sent so out-of-order deliveries can't overwrite newer data
      console.log('User updated, fetch the latest from the API:', data.user_id);
      break;
    case 'user.deleted':
      console.log('User deleted:', data.user_id);
      break;
    case 'org.created':
      console.log('Organization created:', data.org_id);
      break;
    case 'user.added_to_org':
      console.log('User added to org:', data.user_id, data.org_id);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
