// Generated with: honeybadger-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyHoneybadgerRequest } from '../../../lib/verify-honeybadger';

interface HoneybadgerPayload {
  event?: string;
  message?: string;
  [key: string]: unknown;
}

function handleEvent(payload: HoneybadgerPayload): void {
  const { event, message } = payload;

  switch (event) {
    case 'occurred':
      console.log(`Error occurred: ${message}`);
      // TODO: page on-call or open a ticket (payload.fault, payload.notice)
      break;

    case 'resolved':
      console.log(`Error resolved: ${message}`);
      // TODO: close the matching ticket
      break;

    case 'unresolved':
      console.log(`Error reopened: ${message}`);
      // TODO: reopen the matching ticket
      break;

    case 'assigned':
      console.log(`Error assigned: ${message}`);
      // TODO: notify payload.assignee
      break;

    case 'commented':
      console.log(`Error commented: ${message}`);
      // TODO: sync payload.comment
      break;

    case 'rate_exceeded':
      console.log(`Error rate exceeded: ${message}`);
      // TODO: escalate
      break;

    case 'volume_spike':
      console.log(`Error volume spike: ${message}`);
      // TODO: escalate
      break;

    case 'deployed':
      console.log(`Deploy recorded: ${message}`);
      // TODO: annotate dashboards with payload.deploy
      break;

    case 'down':
      console.log(`Site down: ${message}`);
      // TODO: open an incident (payload.site, payload.outage)
      break;

    case 'up':
      console.log(`Site back up: ${message}`);
      // TODO: resolve the incident
      break;

    case 'cert_will_expire':
      console.log(`Certificate expiring: ${message}`);
      // TODO: schedule a renewal
      break;

    case 'check_in_missing':
      console.log(`Check-in missing: ${message}`);
      // TODO: alert on the stalled job (payload.check_in)
      break;

    case 'check_in_reporting':
      console.log(`Check-in reporting: ${message}`);
      // TODO: clear the missing-check-in alert
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyHoneybadgerRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Honeybadger-Token' }, { status: 401 });
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
    handleEvent(payload as HoneybadgerPayload);
  } catch (err) {
    console.error('Error handling Honeybadger event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
