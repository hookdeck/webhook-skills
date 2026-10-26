import { NextRequest, NextResponse } from 'next/server';
import { verifyBindbeeSignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw body is required: the signature covers the exact bytes Bindbee sent
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.BINDBEE_WEBHOOK_TOLERANCE_SECONDS) || 0;

  const valid = verifyBindbeeSignature(
    rawBody,
    {
      id: request.headers.get('webhook-id'),
      timestamp: request.headers.get('webhook-timestamp'),
      signature: request.headers.get('webhook-signature'),
    },
    process.env.BINDBEE_WEBHOOK_SECRET,
    tolerance
  );
  if (!valid) {
    console.error('Bindbee webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let payload: { event?: string; data?: unknown; sync?: unknown; error?: unknown; connector?: unknown };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // payload.id equals the webhook-id header: use it to dedupe retries.
  // payload.sequence orders events per connector (order is not guaranteed across syncs).
  switch (payload.event) {
    case 'connector.linked':
      console.log('Connector linked:', payload.connector);
      break;
    case 'connector.relinked':
      console.log('Connector relinked:', payload.connector);
      break;
    case 'connector.relink_needed':
      console.log('Connector needs relink:', payload.connector, payload.error);
      break;
    case 'connector.sync.started':
      console.log('Sync started:', payload.sync);
      break;
    case 'connector.sync.completed':
      console.log('Sync completed:', payload.sync);
      break;
    case 'connector.sync.failed':
      console.log('Sync failed:', payload.sync, payload.error);
      break;
    case 'hris.employee.created':
      console.log('Employee created:', payload.data);
      break;
    case 'hris.employee.updated':
      console.log('Employee updated:', payload.data);
      break;
    default:
      console.log('Unhandled event:', payload.event);
  }

  return NextResponse.json({ received: true });
}
