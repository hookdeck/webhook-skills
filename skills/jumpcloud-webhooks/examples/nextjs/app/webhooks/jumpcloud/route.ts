// Generated with: jumpcloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyJumpCloudRequest } from '../../../lib/verify-jumpcloud';

// JumpCloud documents the field names but no example body or category values.
interface JumpCloudAlert {
  alert_id?: string;
  alert_title?: string;
  category?: string;
  di_event?: string;
  event_description?: string;
  priority?: string;
  rule_id?: string;
  status?: string;
  [key: string]: unknown;
}

function handleAlert(alert: JumpCloudAlert): void {
  const { alert_id, alert_title, priority, status, category, di_event } = alert;
  console.log(
    `JumpCloud alert ${alert_id} "${alert_title}" [${priority}/${status}] ` +
      `category=${category} di_event=${di_event}`
  );
  // TODO: open or update a ticket keyed on alert_id; route on priority and status
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyJumpCloudRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
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
    handleAlert(payload as JumpCloudAlert);
  } catch (err) {
    console.error('Error handling JumpCloud alert:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
