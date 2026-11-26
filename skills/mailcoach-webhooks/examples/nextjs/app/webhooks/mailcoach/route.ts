// Generated with: mailcoach-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw bytes are required for signature verification: do not parse before the check
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('signature');

  if (!verifySignature(rawBody, signature, process.env.MAILCOACH_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Missing or invalid Signature header' }, { status: 401 });
  }

  let payload: {
    event?: string;
    email?: string;
    email_list_uuid?: string;
    subscriber_email?: string | null;
    send_uuid?: string;
    name?: string;
    sent_to_number_of_subscribers?: number;
  };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is in the body (`event`); no header carries it
  switch (payload?.event) {
    case 'UnconfirmedSubscriberCreatedEvent':
      console.log(`Unconfirmed subscriber: ${payload.email} (list ${payload.email_list_uuid})`);
      // Your code: wait for SubscribedEvent before treating them as subscribed
      break;

    case 'SubscribedEvent':
    case 'ResubscribedEvent':
      console.log(`Subscribed: ${payload.email} (list ${payload.email_list_uuid})`);
      // Your code: create or update the subscriber in your database
      break;

    case 'UnsubscribedEvent':
      console.log(`Unsubscribed: ${payload.email} (list ${payload.email_list_uuid})`);
      // Your code: mark the subscriber as unsubscribed
      break;

    case 'CampaignSentEvent':
      console.log(`Campaign sent: ${payload.name} to ${payload.sent_to_number_of_subscribers} subscribers`);
      // Your code: record the send (the statistics may not be final yet)
      break;

    case 'BounceRegisteredEvent':
    case 'SoftBounceRegisteredEvent':
      console.log(`${payload.event}: ${payload.subscriber_email} (send ${payload.send_uuid})`);
      // Your code: flag the address; BounceRegisteredEvent is a permanent failure
      break;

    default:
      console.log('Unhandled event:', payload?.event);
  }

  return NextResponse.json({ received: true });
}
