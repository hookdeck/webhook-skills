import { NextRequest, NextResponse } from 'next/server';
import {
  CallRailPayload,
  classifyCallRailEvent,
  isTimestampFresh,
  verifyCallRailSignature,
} from '../../../lib/verify-callrail';

function handleCallRailEvent(event: string, payload: CallRailPayload) {
  switch (event) {
    case 'pre_call':
      console.log(`Incoming call from ${payload.customer_phone_number} to ${payload.tracking_phone_number}`);
      // TODO: Screen-pop or CRM lookup (respond quickly, the call is still ringing)
      break;

    case 'answered_call':
      console.log(`Call ${payload.id} routed`);
      // TODO: Update the agent's live view
      break;

    case 'post_call':
    case 'post_outbound_call':
      console.log(`Call ${payload.id} finished (${payload.duration}s, answered=${payload.answered})`);
      // TODO: Store the call, recording and transcription
      break;

    case 'updated_call':
    case 'updated_outbound_call':
      console.log(`Call ${payload.id} modified: ${payload.changes.join(', ')}`);
      // TODO: Refresh tags, notes, value, transcription or call summary
      break;

    case 'sms_received':
      console.log(`Text received from ${payload.source_number}: ${payload.content}`);
      // TODO: Route the message to your inbox or CRM
      break;

    case 'sms_sent':
      console.log(`Text sent by ${payload.agent} to ${payload.destination_number}`);
      // TODO: Log the outbound message
      break;

    case 'form_captured':
      console.log(`Form submission ${payload.id} from ${payload.form_url}`);
      // TODO: Create a lead from payload.form_data
      break;

    case 'convert_assist_complete':
      console.log(`Convert Assist finished for ${payload.person_resource_id}`);
      // TODO: Store payload.answers
      break;

    case 'call':
      // Inbound call object (pre-call, call routing complete or post-call).
      // Add ?callrail_event=<name> to each webhook URL to tell them apart.
      console.log(`Call event for ${payload.id}`);
      break;

    default:
      console.log('Unhandled CallRail webhook payload');
  }
}

export async function POST(request: NextRequest) {
  const signingKey = process.env.CALLRAIL_SIGNING_KEY;
  if (!signingKey) {
    console.error('CALLRAIL_SIGNING_KEY is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Signature header' }, { status: 400 });
  }

  // Raw body for signature verification - don't use request.json() first
  const rawBody = await request.text();
  if (!verifyCallRailSignature(rawBody, signature, signingKey)) {
    console.error('CallRail webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let payload: CallRailPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const tolerance = Number(process.env.CALLRAIL_TIMESTAMP_TOLERANCE_SECONDS || 0);
  if (!isTimestampFresh(payload, tolerance)) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 400 });
  }

  const event = classifyCallRailEvent(payload, new URL(request.url).searchParams.get('callrail_event'));
  // CallRail does not resend failed webhooks: respond 2xx quickly and
  // de-duplicate on payload.id / payload.resource_id if you process async.
  handleCallRailEvent(event, payload);

  return NextResponse.json({ received: true, event });
}
