// Generated with: worldpay-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Access Worldpay event webhooks. WPG (Corporate Gateway) XML order
// notifications are a different family: unsigned text/xml that must be
// answered with HTTP 200 and the literal body "[OK]". They don't belong on this
// route. Behind Hookdeck, the WORLDPAY source answers "[OK]" for you.
import { NextResponse, after } from 'next/server';
import {
  KNOWN_EVENTS,
  eventKey,
  loadSecrets,
  processEvent,
  seenEventIds,
  verifyWorldpaySignature,
  type WorldpayEvent,
} from '../../../lib/worldpay';

export async function POST(request: Request) {
  const secrets = loadSecrets();
  if (secrets.size === 0) {
    // Fail closed: never skip verification because the secret is missing.
    console.error('No WORLDPAY_WEBHOOK_SECRET_<keyId> set: rejecting webhook');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Worldpay's documented contract: no signature (when set up for HMAC) -> 400,
  // signature mismatch -> discard the body and return 400. Not 401/403.
  const header = request.headers.get('event-signature');
  if (!header) {
    return NextResponse.json({ error: 'Missing Event-Signature header' }, { status: 400 });
  }

  // Raw text, not request.json(): the HMAC covers the exact bytes, and
  // request.text() doesn't care that the Content-Type is
  // application/vnd.worldpay.events-v1.hal+json.
  const rawBody = await request.text();
  if (!verifyWorldpaySignature(rawBody, header, secrets)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: WorldpayEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const details = event?.eventDetails;
  if (typeof event?.eventId !== 'string' || !details || typeof details !== 'object') {
    return NextResponse.json({ error: 'Not an Access Worldpay event' }, { status: 400 });
  }

  // Worldpay retries until it gets a 200 (for up to a week): duplicates are normal.
  if (seenEventIds.has(event.eventId)) {
    return NextResponse.json({ received: true, eventId: event.eventId, duplicate: true });
  }
  seenEventIds.add(event.eventId);

  const { classification, type } = details;
  if (!KNOWN_EVENTS.has(eventKey(classification, type))) {
    console.log(`Ignoring unknown Worldpay event ${classification}:${type}`);
    return NextResponse.json({ received: true, eventId: event.eventId, ignored: 'unknown event' });
  }

  // Acknowledge first; after() runs the processing once the response is sent.
  after(() =>
    processEvent(event).catch((err: Error) => console.error('Worldpay event processing failed:', err.message)),
  );
  return NextResponse.json({ received: true, eventId: event.eventId, classification, type });
}
