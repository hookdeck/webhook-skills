// Generated with: tiltify-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { toleranceFromEnv, verifyTiltifySignature } from '../../../lib/tiltify-signature';

interface TiltifyEvent {
  data?: { id?: string };
  meta?: { event_type?: string; id?: string };
}

function handleEvent(event: TiltifyEvent) {
  const type = event.meta?.event_type;
  const eventId = event.meta?.id;
  switch (type) {
    case 'public:direct:donation_updated':
    case 'private:direct:donation_updated':
    case 'public:indirect:donation_updated':
    case 'private:indirect:donation_updated':
      // New, moderated or refunded donation. The same donation can arrive more
      // than once, so deduplicate on meta.id.
      console.log(`${type}: donation ${event.data?.id} (event ${eventId})`);
      break;
    case 'public:direct:fact_updated':
    case 'private:direct:fact_updated':
    case 'public:indirect:fact_updated':
    case 'private:indirect:fact_updated':
      // A campaign, team campaign or fundraising event changed (e.g. amount_raised).
      console.log(`${type}: fact ${event.data?.id} (event ${eventId})`);
      break;
    default:
      // Unknown or future types: log and acknowledge.
      console.log(`Unhandled Tiltify event type: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.TILTIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('TILTIFY_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, exactly as signed. Parse only after verification.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const verification = verifyTiltifySignature(
    rawBody,
    request.headers.get('x-tiltify-signature'),
    request.headers.get('x-tiltify-timestamp'),
    secret,
    toleranceFromEnv()
  );
  if (!verification.valid) {
    console.error('Tiltify webhook verification failed:', verification.error);
    return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // In production: persist the event, return 2xx, then process asynchronously.
  // Tiltify deactivates an endpoint after 12 failed retries.
  handleEvent(event as TiltifyEvent);

  return NextResponse.json({ received: true });
}
