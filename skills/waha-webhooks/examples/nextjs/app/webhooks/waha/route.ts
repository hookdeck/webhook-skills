import { NextRequest, NextResponse } from 'next/server';
import { verifyWahaSignature } from '../../../lib/waha';

// Handle a verified WAHA event, dispatching on the envelope's `event` field
function handleWahaEvent(event: any) {
  const payload = event.payload;
  switch (event.event) {
    case 'message':
      console.log(`Incoming message from ${payload?.from}: ${payload?.body}`);
      // TODO: Route to your bot / inbox logic
      break;

    case 'message.any':
      console.log(`Message (any direction) ${payload?.id}, fromMe=${payload?.fromMe}`);
      // TODO: Mirror the full conversation, including messages you sent
      break;

    case 'message.ack':
      console.log(`Message ${payload?.id} ack: ${payload?.ackName} (${payload?.ack})`);
      // TODO: Update delivery/read status
      break;

    case 'message.reaction':
      console.log(`Reaction on ${payload?.reaction?.messageId}: ${payload?.reaction?.text}`);
      // TODO: Store the reaction
      break;

    case 'session.status':
      console.log(`Session ${event.session} status: ${payload?.status}`);
      // TODO: On SCAN_QR_CODE fetch the QR; alert on FAILED / STOPPED
      break;

    case 'group.v2.join':
      console.log(`Joined group ${payload?.group?.subject} (${payload?.group?.id})`);
      // TODO: Register the group
      break;

    case 'presence.update':
      console.log(`Presence in chat ${payload?.id}:`, payload?.presences);
      // TODO: Update online/typing state
      break;

    default:
      console.log(`Unhandled WAHA event: ${event.event}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.WAHA_WEBHOOK_HMAC_KEY;
  if (!secret) {
    console.error('WAHA_WEBHOOK_HMAC_KEY is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-webhook-hmac');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Webhook-Hmac header' }, { status: 400 });
  }

  // Raw body: read as text before any JSON parsing, whatever the content type
  const rawBody = await request.text();
  const algorithm = request.headers.get('x-webhook-hmac-algorithm') ?? 'sha512';

  if (!verifyWahaSignature(rawBody, signature, secret, algorithm)) {
    console.error('WAHA webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Retries resend the same event: de-duplicate on event.id (evt_...)
  // or the X-Webhook-Request-Id header.
  handleWahaEvent(event);

  return NextResponse.json({ received: true });
}
