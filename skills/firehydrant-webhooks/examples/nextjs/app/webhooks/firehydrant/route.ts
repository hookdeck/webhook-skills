import { NextRequest, NextResponse } from 'next/server';
import { verifyFireHydrantWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Read the raw body once; verification must use the exact bytes received
  const body = await request.text();
  const signature = request.headers.get('fh-signature');

  if (!verifyFireHydrantWebhook(body, signature, process.env.FIREHYDRANT_WEBHOOK_SECRET)) {
    console.error('FireHydrant signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const resourceType = payload.event?.resource_type;
  // Operation casing varies (UPDATED vs updated), so normalise it
  const operation = String(payload.event?.operation ?? '').toUpperCase();

  switch (resourceType) {
    case 'incident': {
      const incident = payload.data?.incident;
      console.log(`Incident #${incident?.number} ${operation}: ${incident?.name} (${incident?.current_milestone})`);
      // TODO: Sync to ticketing, post status updates, etc.
      break;
    }

    case 'change_event':
      console.log(`Change event ${operation}: ${payload.data?.summary}`);
      // TODO: Track deploys, correlate with incidents, etc.
      break;

    case 'signals_alerts': {
      const alert = payload.data?.alert;
      console.log(`Signals alert ${operation}: ${alert?.summary} (${alert?.status}, decision: ${alert?.decision})`);
      // TODO: Forward alerts, track alert lifecycle, etc.
      break;
    }

    default:
      console.log(`Unhandled resource type: ${resourceType}`);
  }

  return NextResponse.json({ received: true });
}
