import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a TextUs webhook signature: `X-TextUs-Signature` is the bare hex
 * HMAC-SHA256 of the raw body, keyed with the whole `textus-...` secret.
 */
function verifyTextUsSignature(
  rawBody: Buffer,
  header: string | null,
  secret: string | undefined
): boolean {
  // Validate hex first: Buffer.from(x, 'hex') silently truncates invalid input.
  if (!secret || !header || !/^[0-9a-f]{64}$/i.test(header)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(header, 'hex'), expected);
}

export async function POST(request: NextRequest) {
  // Read the raw bytes: never request.json() before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-textus-signature');

  if (!verifyTextUsSignature(rawBody, signature, process.env.TEXTUS_WEBHOOK_SECRET)) {
    console.error('TextUs webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { action?: string; message?: { id?: string }; contact?: { id?: string }; optOut?: unknown };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is in `action`.
  switch (event.action) {
    case 'message.received':
      console.log('Message received:', event.message?.id);
      // TODO: Route the reply to your CRM or support queue.
      break;

    case 'message.delivered':
      console.log('Message delivered:', event.message?.id);
      // TODO: Mark the outgoing message as delivered.
      break;

    case 'message.failed':
    case 'message.unknown':
      console.log(`Message problem (${event.action}):`, event.message?.id);
      // TODO: Alert or retry through another channel.
      break;

    case 'phone_call.completed':
      console.log('Phone call completed');
      // TODO: Log the call against the contact.
      break;

    case 'contact.opted_out':
      console.log('Contact opted out:', event.optOut);
      // TODO: Suppress this number in your systems.
      break;

    case 'contact.opted_in':
      console.log('Contact opted in:', event.optOut);
      // TODO: Re-enable messaging for this number.
      break;

    case 'contact.created':
      console.log('Contact created:', event.contact?.id);
      // TODO: Sync the new contact.
      break;

    default:
      console.log(`Unhandled event: ${event.action}`);
  }

  return NextResponse.json({ received: true });
}
