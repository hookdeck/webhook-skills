// Generated with: zoho-sign-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyZohoSignSignature } from '../../../lib/zoho-sign';

export async function POST(request: NextRequest) {
  const secret = process.env.ZOHO_SIGN_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never process unverified webhooks
    console.error('ZOHO_SIGN_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-zs-webhook-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-ZS-WEBHOOK-SIGNATURE header' }, { status: 400 });
  }

  // Raw body: do not use request.json() before verifying
  const rawBody = await request.text();
  if (!verifyZohoSignSignature(rawBody, signature, secret)) {
    console.error('Zoho Sign signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const notification = payload.notifications ?? {};
  const req = payload.requests ?? {};
  const eventType: string | undefined = notification.operation_type;

  switch (eventType) {
    case 'RequestSubmitted':
      console.log(`Request submitted: ${req.request_name} (${req.request_id})`);
      break;
    case 'RequestViewed':
      console.log(`Request viewed by ${notification.performed_by_email}`);
      break;
    case 'RequestSigningSuccess':
      console.log(`Signed by ${notification.performed_by_email} (action ${notification.action_id})`);
      break;
    case 'RequestCompleted':
      console.log(`Request completed: ${req.request_name} (${req.request_id})`);
      break;
    case 'RequestRejected':
      console.log(`Request rejected: ${notification.reason || 'no reason given'}`);
      break;
    case 'RequestRecalled':
      console.log(`Request recalled: ${req.request_id}`);
      break;
    case 'RequestForwarded':
      console.log(`Request forwarded by ${notification.performed_by_email}`);
      break;
    case 'RequestExpired':
      console.log(`Request expired: ${req.request_id}`);
      break;
    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // There is no event ID, so key idempotency on request, event, action and time
  // (see references/overview.md).
  return NextResponse.json({ received: true });
}
