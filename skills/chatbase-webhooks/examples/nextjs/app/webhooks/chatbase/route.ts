import { NextRequest, NextResponse } from 'next/server';
import { verifyChatbaseSignature, parseEventType, type ChatbaseEvent } from '../../../lib/verify-chatbase';

function handleEvent(event: ChatbaseEvent) {
  const { eventType, chatbotId, payload = {} } = event;
  const { kind, actionName } = parseEventType(eventType);

  switch (kind) {
    case 'leads.submit':
      console.log(`New lead for agent ${chatbotId}: ${payload.customerName} <${payload.customerEmail}>`);
      // payload.customFields holds custom fields and UTM values when configured
      // TODO: Create the contact in your CRM
      break;
    case 'custom_form.submit':
      console.log(`Custom form "${actionName}" submitted in conversation ${payload.conversationId}`, payload.data);
      if (payload.error) console.warn(`Attachment upload failed: ${payload.error}`);
      // TODO: Store the submission
      break;
    case 'collect_data.submit':
      console.log(`Collect Data "${actionName}" submitted in conversation ${payload.conversationId}`, payload.customFields);
      // TODO: Store the collected fields
      break;
    case 'phone_call.summary':
      console.log(`Call from ${payload.callerNumber} to ${payload.calledNumber} (${payload.duration}s): ${payload.callSummary}`);
      // TODO: Log the call against the caller's record
      break;
    default:
      console.log(`Unhandled Chatbase event: ${eventType}`);
  }
  return kind;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CHATBASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CHATBASE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-chatbase-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing x-chatbase-signature header' }, { status: 400 });
  }

  // Raw body for signature verification - don't call request.json() first
  const rawBody = await request.text();
  if (!verifyChatbaseSignature(rawBody, signature, secret)) {
    console.error('Chatbase webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let event: ChatbaseEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const kind = handleEvent(event);
  return NextResponse.json({ received: true, eventType: event.eventType, kind });
}
