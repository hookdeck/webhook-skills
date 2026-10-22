// Generated with: northflank-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyNorthflankRequest } from '../../../lib/verify-northflank';

/**
 * Event names come from Northflank's notification integration trigger list.
 * Only the build payload is shown in the docs; read other payloads defensively.
 */
interface NorthflankPayload {
  event?: string;
  data?: {
    build?: { id?: string };
    service?: { id?: string };
    project?: { id?: string };
  };
}

function handleEvent(payload: NorthflankPayload): void {
  const { event, data = {} } = payload;
  const project = data.project?.id;

  switch (event) {
    case 'build:start':
      console.log(`Build started: ${data.build?.id} (${project}/${data.service?.id})`);
      break;

    case 'build:success':
      console.log(`Build succeeded: ${data.build?.id} (${project}/${data.service?.id})`);
      // TODO: trigger a release or notify your team
      break;

    case 'build:failure':
      console.log(`Build failed: ${data.build?.id} (${project}/${data.service?.id})`);
      // TODO: open a ticket or alert the owning team
      break;

    case 'service:deployment:status-update':
      console.log(`Deployment status update in ${project}`);
      // TODO: update your deployment dashboard
      break;

    case 'job-run:failure':
      console.log(`Job run failed in ${project}`);
      // TODO: create a ticket in your bug tracker
      break;

    case 'addon-backup:success':
      console.log(`Backup succeeded in ${project}`);
      // TODO: download the backup via the Northflank API
      break;

    case 'addon-backup:failure':
      console.log(`Backup failed in ${project}`);
      // TODO: alert the owning team
      break;

    case 'billing:invoice-payment-failed':
      console.log('Invoice payment failed');
      // TODO: notify your finance contact
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyNorthflankRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing token' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // text() reads the body whatever its content type.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as NorthflankPayload);
  } catch (err) {
    console.error('Error handling Northflank event:', err);
    // Northflank resends notifications that don't get a 2xx.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
