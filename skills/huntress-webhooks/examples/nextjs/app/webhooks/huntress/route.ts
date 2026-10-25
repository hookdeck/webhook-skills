// Generated with: huntress-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { parseHuntressEvent } from '../../../lib/huntress';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.HUNTRESS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('HUNTRESS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Huntress signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature and enforces a fixed 5-minute timestamp window. Hookdeck retries
    // and replays resend the original timestamp, so use the manual verifier in
    // references/verification.md if late retries must still verify.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Huntress webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, payload } = parseHuntressEvent(body);
  // svix-id is stable across retries: use it to deduplicate, and log it so you can
  // match it to the Portal's "View Delivery Attempts" page
  console.log(`Received Huntress webhook ${svixId}: ${type ?? '(untyped payload)'}`);

  // Verify, enqueue, return 200 fast: do the real work out of band
  console.log('Huntress payload:', JSON.stringify(payload));

  return NextResponse.json({ success: true, id: svixId, type });
}
