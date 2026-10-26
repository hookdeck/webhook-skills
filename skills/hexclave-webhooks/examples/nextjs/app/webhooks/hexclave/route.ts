// Generated with: hexclave-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Hexclave (via Svix) sends svix-* headers; Hookdeck also accepts the Standard Webhooks webhook-* names
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('svix-id') ? 'svix' : 'webhook';
  return {
    id: headers.get(`${prefix}-id`),
    timestamp: headers.get(`${prefix}-timestamp`),
    signature: headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.HEXCLAVE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('HEXCLAVE_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id, timestamp, signature } = readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Svix signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Hexclave webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let payload: { type?: string; data?: Record<string, any> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body is { type, data }: `type` is the event name, `data` the user, team, membership or permission
  const { type, data } = payload;
  // The svix-id is stable across retries: use it to deduplicate
  console.log(`Received Hexclave webhook ${id}: ${type}`);

  switch (type) {
    case 'user.created':
      console.log('User created:', data?.id);
      break;
    case 'user.updated':
      console.log('User updated:', data?.id);
      break;
    case 'user.deleted':
      console.log('User deleted:', data?.id);
      break;
    case 'team.created':
      console.log('Team created:', data?.id, data?.display_name);
      break;
    case 'team.updated':
      console.log('Team updated:', data?.id, data?.display_name);
      break;
    case 'team.deleted':
      console.log('Team deleted:', data?.id);
      break;
    case 'team_membership.created':
      console.log('Team membership created:', data);
      break;
    case 'team_membership.deleted':
      console.log('Team membership deleted:', data);
      break;
    case 'team_permission.created':
      console.log('Team permission created:', data);
      break;
    case 'team_permission.deleted':
      console.log('Team permission deleted:', data);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type: type ?? null });
}
