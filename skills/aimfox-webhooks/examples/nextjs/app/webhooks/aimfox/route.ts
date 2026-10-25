// Generated with: aimfox-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAimfoxRequest } from '../../../lib/verify-aimfox';

interface AimfoxPayload {
  id?: string;
  event_type?: string;
  workspace?: Record<string, unknown>;
  event?: Record<string, unknown>;
  [key: string]: unknown;
}

function handleEvent(payload: AimfoxPayload): void {
  const { event_type: type, id } = payload;

  switch (type) {
    case 'account_logged_in':
      console.log(`Account logged in (${id})`);
      // TODO: mark the account active (payload.event.account)
      break;

    case 'account_logged_out':
      console.log(`Account logged out (${id})`);
      // TODO: alert someone to re-authenticate (payload.event.account)
      break;

    case 'new_connection':
      console.log(`New connection (${id})`);
      // TODO: create a CRM contact
      break;

    case 'view':
      console.log(`Profile viewed (${id})`);
      break;

    case 'connect':
      console.log(`Connection request sent (${id})`);
      break;

    case 'accepted':
      console.log(`Connection request accepted (${id})`);
      // TODO: start a follow-up sequence
      break;

    case 'inmail':
      console.log(`InMail sent (${id})`);
      break;

    case 'message':
      console.log(`Message sent (${id})`);
      break;

    case 'new_reply':
      console.log(`New reply (${id})`);
      // TODO: notify sales
      break;

    case 'reply':
      console.log(`First campaign reply (${id})`);
      break;

    case 'inmail_reply':
      console.log(`InMail reply (${id})`);
      break;

    case 'lead_label_added':
      console.log(`Lead label added (${id})`);
      // TODO: sync the label to your CRM
      break;

    case 'campaign_created':
      console.log(`Campaign created (${id})`);
      break;

    case 'campaign_started':
      console.log(`Campaign started (${id})`);
      break;

    case 'campaign_ended':
      console.log(`Campaign ended (${id})`);
      break;

    case 'inbox_event':
      console.log(`Inbox event (${id})`);
      break;

    case 'campaign_reply':
      console.log(`Campaign reply (${id})`);
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyAimfoxRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Aimfox authentication header' },
      { status: 401 }
    );
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
    handleEvent(payload as AimfoxPayload);
  } catch (err) {
    console.error('Error handling Aimfox event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
