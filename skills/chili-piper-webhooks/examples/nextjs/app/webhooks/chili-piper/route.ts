import { NextRequest, NextResponse } from 'next/server';
import { isTimestampFresh, verifyChiliPiperSignature } from '../../../lib/verify-chili-piper';

function handleChiliPiperEvent(payload: Record<string, any>) {
  // The body's `type` matches the webhook type: Created, Updated or Deleted
  switch (payload.type) {
    case 'Created':
      console.log(`Meeting ${payload.meetingIdChili} booked: ${payload.meetingTitle} at ${payload.meetingStartTime}`);
      // TODO: Create the meeting in your CRM or notify the host
      break;

    case 'Updated':
      console.log(`Meeting ${payload.meetingIdChili} updated: ${payload.meetingStartTime}, assignee ${payload.assigneeEmail}`);
      // TODO: Sync the new time or assignee
      break;

    case 'Deleted':
      console.log(`Meeting ${payload.meetingIdChili} canceled`);
      // TODO: Remove the meeting from your CRM
      break;

    default:
      console.log(`Unhandled Chili Piper event type: ${payload.type}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.CHILI_PIPER_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CHILI_PIPER_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-chili-signature');
  const timestamp = request.headers.get('x-chili-timestamp');

  // Raw bytes for signature verification - don't use request.json() first
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyChiliPiperSignature(rawBody, signature, timestamp, secret)) {
    console.error('Chili Piper webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const tolerance = Number(process.env.CHILI_PIPER_WEBHOOK_TOLERANCE_SECONDS || 0);
  if (!isTimestampFresh(timestamp as string, tolerance)) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 401 });
  }

  // Parse only after verification
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Retry behavior is not documented: de-duplicate on meetingIdChili + type
  handleChiliPiperEvent(payload);

  return NextResponse.json({ received: true, type: payload.type });
}
