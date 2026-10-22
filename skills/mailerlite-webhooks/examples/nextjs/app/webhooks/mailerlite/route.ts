import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a MailerLite webhook signature.
 * The Signature header is the bare hex HMAC-SHA256 of the raw body, keyed with the
 * webhook's secret as a UTF-8 string. No prefix, no timestamp.
 */
function verifyMailerLiteWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Buffers differ in length for malformed signatures, which makes timingSafeEqual throw
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleEvent(event: Record<string, any>) {
  // Flat payloads carry `event`; nested and batched payloads carry `type`
  const name = event.event || event.type;

  switch (name) {
    case 'subscriber.created':
      console.log(`New subscriber: ${event.email}`);
      break;
    case 'subscriber.updated':
      console.log(`Subscriber updated: ${event.email}`);
      break;
    case 'subscriber.unsubscribed':
      console.log(`Subscriber unsubscribed: ${event.email}`);
      break;
    case 'subscriber.bounced':
      console.log(`Subscriber bounced: ${event.email}`);
      break;
    case 'subscriber.added_to_group':
      console.log(`${event.subscriber?.email} added to group ${event.group?.name}`);
      break;
    case 'campaign.sent':
      console.log(`Campaign sent: ${event.name} (${event.total_recipients} recipients)`);
      break;
    case 'campaign.open':
    case 'campaign.click':
      console.log(`${name}: ${event.subscriber?.email} on ${event.campaign?.name}`);
      break;
    default:
      console.log(`Unhandled event: ${name}`);
  }
}

export async function POST(request: NextRequest) {
  // Raw body for signature verification (works for any content type)
  const body = await request.text();
  const signature = request.headers.get('signature');

  if (!verifyMailerLiteWebhook(body, signature, process.env.MAILERLITE_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Batchable webhooks deliver { events: [...], total }
  const events = Array.isArray(payload.events) ? payload.events : [payload];
  for (const event of events) {
    handleEvent(event);
  }

  // Respond 2xx within 3 seconds or MailerLite retries (10s, 100s, 1000s)
  return NextResponse.json({ received: true });
}
