// Generated with: onelogin-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { OneLoginEvent, parseEvents, verifyOneLoginRequest } from '../../../lib/verify-onelogin';

function handleEvent(event: OneLoginEvent): void {
  // The broadcaster sends every event type on the account: filter by event_type_id.
  switch (Number(event.event_type_id)) {
    case 5:
      console.log(`User login success: ${event.user_name} (${event.user_id}) from ${event.ipaddr}`);
      // TODO: check event.risk_score and flag risky logins
      break;

    case 6:
      console.log(`User login failed: ${event.user_name || event.login_name} from ${event.ipaddr}`);
      // TODO: count failures and alert on brute force
      break;

    case 7:
      console.log(`User logout: ${event.user_name} (${event.user_id})`);
      // TODO: end the matching session in your app
      break;

    case 8:
      console.log(`User logged into an app: ${event.user_name} -> ${event.app_name}`);
      // TODO: record app access
      break;

    case 11:
      console.log(`User changed password: ${event.user_name} (${event.user_id})`);
      // TODO: revoke other sessions or notify the user
      break;

    case 22:
      console.log(`User added an MFA device: ${event.user_name} (${event.otp_device_name})`);
      // TODO: audit the new factor
      break;

    default:
      console.log(`Unhandled event_type_id: ${event.event_type_id}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyOneLoginRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  // Read as text so any content type is accepted.
  const events = parseEvents(await request.text());
  if (!events) {
    return NextResponse.json({ error: 'Expected a JSON array of events' }, { status: 400 });
  }

  try {
    for (const event of events) handleEvent(event);
  } catch (err) {
    // Non-200 makes OneLogin retry (up to 3 attempts in total).
    console.error('Error handling OneLogin events:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // OneLogin requires HTTP 200; anything else (or a timeout) triggers a retry.
  return NextResponse.json({ received: events.length });
}
