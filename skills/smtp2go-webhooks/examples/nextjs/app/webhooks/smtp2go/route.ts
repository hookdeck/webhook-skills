// Generated with: smtp2go-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { parseBody, verifySmtp2goRequest } from '../../../lib/verify-smtp2go';

function handleEvent(payload: Record<string, unknown>): void {
  switch (payload.event) {
    case 'processed':
      console.log(`Processed ${payload.email_id} for ${payload.rcpt}`);
      break;

    case 'delivered':
      console.log(`Delivered ${payload.email_id} to ${payload.rcpt}`);
      // TODO: mark the message delivered
      break;

    case 'open':
      console.log(`Opened ${payload.email_id} by ${payload.rcpt}`);
      break;

    case 'click':
      console.log(`Click on ${payload.email_id} by ${payload.rcpt}`);
      break;

    case 'bounce':
      console.log(`Bounce (${payload.bounce}) for ${payload.rcpt}: ${payload.message}`);
      // TODO: suppress the address on hard bounces
      break;

    case 'spam':
      console.log(`Spam complaint from ${payload.rcpt}`);
      // TODO: remove the address from your lists
      break;

    case 'unsubscribe':
    case 'resubscribe':
      console.log(`${payload.event} by ${payload.rcpt}`);
      // TODO: update the recipient's preferences
      break;

    case 'reject':
      console.log(`Rejected ${payload.email_id} to ${payload.rcpt}`);
      break;

    case 'sms_sending':
    case 'sms_submitted':
    case 'sms_delivered':
    case 'sms_rejected':
      console.log(`${payload.event}: SMS ${payload.message_id} to ${payload.destination_number}`);
      break;

    case 'sms_failed':
      console.log(`SMS ${payload.message_id} to ${payload.destination_number} failed (${payload.status_code})`);
      // TODO: retry or alert
      break;

    default:
      console.log(`Unhandled SMTP2GO event: ${payload.event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifySmtp2goRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    // Read the raw text so JSON and form-encoded bodies both work.
    payload = parseBody(await request.text(), request.headers.get('content-type'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON or form-encoded body' }, { status: 400 });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling SMTP2GO webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
