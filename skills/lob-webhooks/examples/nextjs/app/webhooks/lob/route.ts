// Generated with: lob-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { isTimestampFresh, verifyLobSignature } from '../../../lib/lob';

// Lob webhook endpoint (Lob sends POST).
export async function POST(request: Request) {
  const secret = process.env.LOB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LOB_WEBHOOK_SECRET is not set');
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  // Use the RAW bytes for verification - do not call request.json() first.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('lob-signature');
  const timestamp = request.headers.get('lob-signature-timestamp');

  if (!verifyLobSignature(rawBody, signature, timestamp, secret)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  const tolerance = Number(process.env.LOB_WEBHOOK_TOLERANCE_SECONDS || 0);
  if (!isTimestampFresh(timestamp, tolerance)) {
    return new NextResponse('Timestamp outside tolerance', { status: 401 });
  }

  // Signature verified - safe to parse.
  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // The event type is event_type.id; the mailpiece/resource is in event.body.
  const eventType: string | undefined = event?.event_type?.id;
  const resource = event?.body ?? {};

  // TODO: use event.id to deduplicate (Lob retries until it sees a 2xx).
  switch (eventType) {
    case 'postcard.created':
      console.log(`Postcard created: ${resource.id}`);
      break;

    case 'postcard.delivered':
      console.log(`Postcard delivered: ${resource.id}`);
      // TODO: trigger the downstream "mail delivered" workflow.
      break;

    case 'postcard.re-routed':
      console.log(`Postcard re-routed: ${resource.id}`);
      break;

    case 'letter.mailed':
      console.log(`Letter mailed: ${resource.id}`);
      break;

    case 'letter.delivered':
      console.log(`Letter delivered: ${resource.id}`);
      break;

    case 'check.in_transit':
      console.log(`Check in transit: ${resource.id}`);
      break;

    case 'self_mailer.rendered_thumbnails':
      console.log(`Self mailer thumbnails rendered: ${resource.id}`);
      // TODO: download resource.thumbnails (small/medium/large URLs) if payload redaction is off.
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Return 2xx quickly: anything else makes Lob retry (8 attempts over ~27.5 hours).
  return NextResponse.json({ received: true });
}
