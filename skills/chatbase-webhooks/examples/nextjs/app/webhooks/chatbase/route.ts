import { NextRequest, NextResponse } from 'next/server';
import { verifyChatbaseSignature, parseEventType, type ChatbaseEvent } from '../../../lib/verify-chatbase';

// Payloads carry names, emails, phone numbers and call summaries: log ids only.
function handleEvent(event: ChatbaseEvent) {
  const { eventType, chatbotId, payload = {} } = event;
  const { kind, actionName } = parseEventType(eventType);

  switch (kind) {
    case 'leads.submit':
      console.log(`leads.submit for agent ${chatbotId}, conversation ${payload.conversationId}`);
      // Your code: create or update the contact in your CRM.
      // payload.customFields holds custom fields and UTM values when configured.
      break;
    case 'custom_form.submit':
      console.log(`Custom form "${actionName}" submitted in conversation ${payload.conversationId}`);
      if (payload.error) console.warn(`Custom form "${actionName}": attachment upload failed`);
      // Your code: store payload.data, the submitted fields keyed by field name.
      break;
    case 'collect_data.submit':
      console.log(`Collect Data "${actionName}" submitted in conversation ${payload.conversationId}`);
      // Your code: store payload.customFields.
      break;
    case 'phone_call.summary':
      console.log(`phone_call.summary for conversation ${payload.conversationId} (${payload.duration}s)`);
      // Your code: attach payload.callSummary to the caller's record.
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

  // Raw bytes for signature verification - don't call request.json() first
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyChatbaseSignature(rawBody, signature, secret)) {
    console.error('Chatbase webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let event: ChatbaseEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const kind = handleEvent(event);
  return NextResponse.json({ received: true, eventType: event.eventType, kind });
}
