import { NextRequest, NextResponse } from 'next/server';
import { verifySegmentSignature } from '../../../lib/verify-segment';

// A Segment spec call (fields vary by type)
type SegmentEvent = {
  type?: string;
  messageId?: string;
  userId?: string;
  anonymousId?: string;
  previousId?: string;
  groupId?: string;
  event?: string;
  name?: string;
  properties?: Record<string, unknown>;
  traits?: Record<string, unknown>;
};

function handleSegmentEvent(event: SegmentEvent) {
  switch (event.type) {
    case 'track':
      console.log(`Track "${event.event}" for ${event.userId || event.anonymousId}`);
      // TODO: Trigger workflows, update usage counters, sync conversions
      break;

    case 'identify':
      console.log(`Identify ${event.userId || event.anonymousId}:`, event.traits);
      // TODO: Upsert the user in your database or CRM
      break;

    case 'page':
      console.log(`Page view: ${event.properties?.path ?? event.name}`);
      // TODO: Content analytics
      break;

    case 'screen':
      console.log(`Screen view: ${event.name}`);
      // TODO: Mobile analytics
      break;

    case 'group':
      console.log(`Group ${event.groupId} for ${event.userId}`);
      // TODO: Sync the account/organization
      break;

    case 'alias':
      console.log(`Alias ${event.previousId} -> ${event.userId}`);
      // TODO: Merge user records
      break;

    case 'delete':
      // Classic Webhooks destination only: user deletion request notification
      console.log(`Delete request for ${event.userId}`);
      // TODO: Start your data-deletion automation
      break;

    default:
      console.log(`Unhandled Segment call type: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.SEGMENT_SHARED_SECRET;
  if (!secret) {
    console.error('SEGMENT_SHARED_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Signature header' }, { status: 400 });
  }

  // Raw body for signature verification - don't use request.json() first
  const rawBody = await request.text();
  if (!verifySegmentSignature(rawBody, signature, secret)) {
    console.error('Segment webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let payload: SegmentEvent | SegmentEvent[];
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Batching sends an array of events; otherwise a single event object
  const events = Array.isArray(payload) ? payload : [payload];
  for (const event of events) {
    // Use event.messageId to de-duplicate retried deliveries
    handleSegmentEvent(event);
  }

  return NextResponse.json({ received: true, count: events.length });
}
