// Generated with: postscript-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPostscriptRequest } from '../../../lib/verify-postscript';

interface PostscriptPayload {
  webhook_id?: string;
  resource_type?: string;
  resource_id?: string;
  event_time?: string;
  event?: string;
  event_data?: Record<string, unknown>;
  [key: string]: unknown;
}

function handleEvent(payload: PostscriptPayload): void {
  const { event } = payload;
  const data = payload.event_data ?? {};

  switch (event) {
    case 'shop.incoming_message':
      console.log(`Incoming message from ${data.from_number}: ${data.body}`);
      // TODO: route to support or reply via the Send Message API
      break;

    case 'shop.subscriber.opt_in':
      console.log(`Subscriber opted in: ${data.id ?? data.subscriber_id}`);
      // TODO: sync the subscriber to your CRM
      break;

    case 'shop.subscriber.opt_out':
      console.log(`Subscriber opted out: ${data.id ?? data.subscriber_id}`);
      // TODO: suppress the subscriber in other channels
      break;

    case 'shop.email_collected':
      console.log(`Email collected: ${data.email}`);
      // TODO: add the email to your list
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPostscriptRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Postscript-Signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as PostscriptPayload);
  } catch (err) {
    console.error('Error handling Postscript event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
