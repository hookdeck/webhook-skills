import { NextRequest, NextResponse } from 'next/server';
import { verifyChatbaseHipaaSignature, type ChatbaseHipaaEvent } from '../../../lib/verify-chatbase';

export async function POST(request: NextRequest) {
  const secret = process.env.CHATBASE_HIPAA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CHATBASE_HIPAA_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body - the signature covers the exact bytes sent
  const rawBody = await request.text();
  const result = verifyChatbaseHipaaSignature(
    rawBody,
    request.headers.get('x-chatbase-signature'),
    request.headers.get('x-chatbase-timestamp'),
    secret
  );
  if (!result.ok) {
    // Any non-2xx works; Chatbase's endpoint check requires the forged probe to be rejected
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  let event: ChatbaseHipaaEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Verification probes carry test: true - acknowledge, never store
  if (event.test) {
    return NextResponse.json({ received: true, test: true });
  }

  // Deduplicate on deliveryId (also in X-Chatbase-Delivery-Id): delivery is at-least-once
  if (event.event === 'conversation.deleted') {
    const conversation = event.conversation;
    console.log(
      `Conversation ${conversation?.id} (agent ${conversation?.chatbotId}) deleted (${event.deletionReason}), ` +
        `${conversation?.messages?.length ?? 0} messages, delivery ${event.deliveryId}`
    );
    // TODO: Queue the conversation for storage; download attachment downloadUrls within 24 hours
  } else {
    console.log(`Unhandled Chatbase HIPAA event: ${event.event}`);
  }

  // Respond quickly - Chatbase times out after 10 seconds
  return NextResponse.json({ received: true, event: event.event });
}
