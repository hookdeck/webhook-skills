// Generated with: iterable-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyIterableRequest } from '../../../lib/verify-iterable';

function handleEvent(payload: Record<string, any>): void {
  const { eventName, email } = payload;
  const dataFields = payload.dataFields ?? {};

  switch (eventName) {
    case 'emailSend':
      console.log(`Email sent to ${email}: ${dataFields.emailSubject}`);
      // TODO: record the send against campaignId / messageId
      break;

    case 'emailOpen':
      console.log(`Email opened by ${email} (campaign ${dataFields.campaignId})`);
      // TODO: record the open (check dataFields.isBot / proxySource)
      break;

    case 'emailClick':
      console.log(`Email link clicked by ${email}: ${dataFields.url}`);
      // TODO: record the click
      break;

    case 'emailBounce':
      console.log(`Email bounced for ${email}: ${dataFields.recipientState}`);
      // TODO: suppress the address on HardBounce
      break;

    case 'emailComplaint':
      console.log(`Spam complaint from ${email}`);
      // TODO: suppress the address
      break;

    case 'emailUnSubscribe': // note the capital S: this is the exact name Iterable sends
      console.log(`Unsubscribe from ${email}: ${dataFields.unsubSource}`);
      // TODO: update the user's marketing preferences
      break;

    case 'smsSend':
      console.log(`SMS sent to ${email || payload.userId}`);
      break;

    case 'pushSend':
      console.log(`Push sent to ${email || payload.userId}`);
      break;

    case 'inAppOpen':
      console.log(`In-app message opened by ${email || payload.userId}`);
      break;

    default:
      console.log(`Unhandled Iterable event: ${eventName}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyIterableRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read the raw text so any content type works.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Record<string, any>);
  } catch (err) {
    console.error('Error handling Iterable webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
