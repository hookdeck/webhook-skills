// Generated with: youmail-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classify, verifyYouMailRequest } from '../../../lib/verify-youmail';

function handleEvent(payload: Record<string, unknown>): void {
  switch (classify(payload)) {
    case 'CALL_EVENT':
      console.log(`Call events: ${Array.isArray(payload.callEvents) ? payload.callEvents.length : 1}`);
      // TODO: store the call events (callEventUuid, callResult, originator, destination)
      break;

    case 'PHONE_INSIGHTS':
      console.log('Phone insights summaries received');
      // TODO: process the *Summaries arrays
      break;

    case 'PROVIDER_TN_REPORT_STATUS':
      console.log(`TN report ${payload.tnReportUuid} (${payload.phoneNumber}): ${payload.status}`);
      // TODO: update the TN report status in your system
      break;

    case 'WATCHLIST_SCORE_THRESHOLD':
      console.log(
        `Score threshold for ${payload.phoneNumber}: spam ${payload.oldSpamScore} -> ${payload.newSpamScore}`
      );
      // TODO: alert on the changed spam, unlawful or fraud scores
      break;

    default:
      console.log('Unhandled YouMail payload (unrecognized top-level keys)');
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyYouMailRequest(request.headers)) {
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
    handleEvent(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling YouMail webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
