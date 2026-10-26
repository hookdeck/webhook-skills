// Generated with: rocketreach-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyRocketReachSignature } from '../../../lib/rocketreach';

export async function POST(request: NextRequest) {
  const secret = process.env.ROCKETREACH_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never process unverified webhooks
    console.error('ROCKETREACH_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-rocketreach-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-RocketReach-Signature header' }, { status: 401 });
  }

  // Raw body: do not use request.json() before verifying
  const rawBody = await request.text();
  if (!verifyRocketReachSignature(rawBody, signature, secret)) {
    console.error('RocketReach signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // There are no event types. A People Lookup delivers one profile object and a Bulk
  // People Lookup delivers a list of them.
  const requestId = request.headers.get('rr-request-id');
  const profiles: any[] = Array.isArray(payload) ? payload : [payload];

  for (const profile of profiles) {
    const list = profile?.profile_list ? ` (list ${profile.profile_list.id})` : '';
    if (profile?.status === 'complete') {
      console.log(`Lookup complete for profile ${profile.id}${list} [request ${requestId}]`);
    } else {
      console.log(`Lookup ${profile?.status || 'update'} for profile ${profile?.id}${list} [request ${requestId}]`);
    }
  }

  // Key idempotency on the RR-Request-ID header plus the profile id
  // (see references/overview.md).
  return NextResponse.json({ received: true, profiles: profiles.length });
}
