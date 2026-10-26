// Generated with: auvik-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuvikRequest } from '../../../lib/verify-auvik';

interface AuvikAlert {
  alertId?: string;
  alertName?: string;
  alertStatus?: number;
  alertStatusString?: string;
  alertDescription?: string;
  entityName?: string;
  companyName?: string;
  date?: string;
  link?: string;
  [key: string]: unknown;
}

function handleAlert(payload: AuvikAlert): void {
  const { alertStatusString, alertName, entityName, companyName } = payload;

  switch (alertStatusString) {
    case 'Triggered':
      console.log(`Alert triggered: ${alertName} on ${entityName} (${companyName})`);
      // TODO: open an incident or ticket (payload.alertId, payload.alertDescription, payload.link)
      break;

    case 'Cleared':
      console.log(`Alert cleared: ${alertName} on ${entityName} (${companyName})`);
      // TODO: resolve the matching incident (payload.alertId)
      break;

    default:
      console.log(`Unhandled alert status: ${alertStatusString}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyAuvikRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Auvik webhook header' }, { status: 401 });
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
    handleAlert(payload as AuvikAlert);
  } catch (err) {
    console.error('Error handling Auvik alert:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
