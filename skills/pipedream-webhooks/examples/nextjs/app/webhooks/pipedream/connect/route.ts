// Generated with: pipedream-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { safeEqual, type PipedreamConnectionEvent } from '../../../../lib/pipedream-signature';

// Connection webhooks: sent to a Connect token's webhook_uri. NOT signed by Pipedream.
export async function POST(request: NextRequest) {
  // Pipedream doesn't sign these, so the only protection is a secret you put in
  // the webhook_uri yourself. Treat the payload as a hint and confirm it with
  // the Retrieve Account API before trusting it.
  const expectedToken = process.env.PIPEDREAM_CONNECT_WEBHOOK_TOKEN;
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (expectedToken && !safeEqual(token, expectedToken)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  let event: PipedreamConnectionEvent;
  try {
    event = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  switch (event.event) {
    case 'CONNECTION_SUCCESS':
      // Credentials are not in the payload; fetch them with Retrieve Account.
      console.log(`Account ${event.account?.id} connected for ${event.account?.external_id}`);
      break;
    case 'CONNECTION_ERROR':
      console.log(`Connection failed for token ${event.connect_token}: ${event.error}`);
      break;
    default:
      console.log('Unhandled Pipedream connection event:', (event as { event?: string }).event);
  }

  return NextResponse.json({ received: true });
}
