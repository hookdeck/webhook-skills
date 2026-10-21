import { NextRequest, NextResponse } from 'next/server';
import { verifyAtlasSignature } from '../../../lib/verify-atlas';

// An Atlas alert (same shape as the Administration API Alerts resource)
type AtlasAlert = {
  id?: string;
  groupId?: string;
  eventTypeName?: string;
  status?: string;
  humanReadable?: string;
  metricName?: string;
  currentValue?: { number?: number; units?: string };
};

// `status` is OPEN while the alert condition holds and CLOSED when resolved
function handleAlert(alert: AtlasAlert) {
  switch (alert.eventTypeName) {
    case 'OUTSIDE_METRIC_THRESHOLD':
      console.log(
        `Metric alert ${alert.id} (${alert.status}): ${alert.metricName} = ` +
        `${alert.currentValue?.number} ${alert.currentValue?.units ?? ''}`
      );
      // TODO: Page on-call, open an incident, or auto-scale on OPEN; resolve on CLOSED
      break;

    case 'HOST_DOWN':
      console.log(`Host down alert ${alert.id} (${alert.status}): ${alert.humanReadable}`);
      // TODO: Notify on-call / trigger failover checks
      break;

    default:
      console.log(`Unhandled Atlas alert ${alert.id}: ${alert.eventTypeName} (${alert.status})`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.MONGODB_ATLAS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MONGODB_ATLAS_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Header is only sent when a Webhook Secret is set in Atlas
  const signature = request.headers.get('x-mms-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-MMS-Signature header' }, { status: 400 });
  }

  // Raw body for signature verification - don't use request.json() first
  const rawBody = await request.text();
  if (!verifyAtlasSignature(rawBody, signature, secret)) {
    console.error('MongoDB Atlas webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let alert: AtlasAlert;
  try {
    alert = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // X-MMS-Event carries the alert state (alert.open, alert.close, ...)
  console.log(`X-MMS-Event: ${request.headers.get('x-mms-event')}`);
  // Use alert.id plus status/updated to de-duplicate retried deliveries
  handleAlert(alert);

  // Any 2xx tells Atlas the delivery succeeded
  return NextResponse.json({ received: true });
}
