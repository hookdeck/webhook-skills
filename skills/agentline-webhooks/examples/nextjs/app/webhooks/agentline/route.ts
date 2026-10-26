import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an AgentLine webhook signature: bare hex HMAC-SHA256 of the raw body,
 * keyed with the webhook signing secret (UTF-8). No timestamp is signed.
 */
function verifyAgentLineSignature(rawBody: string, signature: string, secret: string): boolean {
  // Validate shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export async function POST(request: NextRequest) {
  // Read the RAW body; do not parse before verifying
  const rawBody = await request.text();
  const signature = request.headers.get('x-webhook-signature');
  const secret = process.env.AGENTLINE_WEBHOOK_SECRET;

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Webhook-Signature header' }, { status: 400 });
  }
  if (!secret) {
    return NextResponse.json({ error: 'AGENTLINE_WEBHOOK_SECRET not configured' }, { status: 500 });
  }
  if (!verifyAgentLineSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { event_id?: string; event_type?: string; type?: string; event?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The delivery envelope isn't spelled out in the docs; the events API uses `event_type`
  const eventType = event.event_type || event.type || event.event;
  console.log(`Received AgentLine webhook: ${eventType} (${event.event_id ?? 'no id'})`);

  switch (eventType) {
    case 'call.received':
      console.log('Inbound call answered');
      break;
    case 'call.utterance':
      // conversation roles here are `user` and `assistant`
      console.log('Live caller turn');
      break;
    case 'call.completed':
      console.log('Call completed');
      break;
    case 'call.owner_task':
      console.log('Owner task requested');
      break;
    case 'call.failed':
    case 'call.busy':
    case 'call.no-answer':
    case 'call.canceled':
      console.log(`Call did not connect: ${eventType}`);
      break;
    case 'sms.received':
      console.log('Inbound SMS');
      break;
    case 'webhook.test':
      console.log('Test webhook received');
      break;
    default:
      console.log('Unhandled event type:', eventType);
  }

  return NextResponse.json({ received: true });
}
