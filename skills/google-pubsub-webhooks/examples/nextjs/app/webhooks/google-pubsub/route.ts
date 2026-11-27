// Generated with: google-pubsub-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';

import { authenticate, decodeData, type PubSubPushEnvelope } from '../../../lib/pubsub';

// google-auth-library needs Node crypto and the network, so this route must run
// on the Node.js runtime (not Edge).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Status codes Pub/Sub treats as an acknowledgement: 102, 200, 201, 202, 204.
// Anything else (including a timeout) is a nack and the message is redelivered.
const ACK_STATUS = 204;

export async function POST(request: Request) {
  // Authenticate before parsing anything.
  const auth = await authenticate(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Pub/Sub sends Content-Type: application/json. Unlike HMAC webhooks there is
  // no body signature, so there is no need to capture the raw body.
  let envelope: PubSubPushEnvelope;
  try {
    envelope = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = envelope?.message;
  if (!message || typeof message !== 'object' || !message.messageId) {
    return NextResponse.json({ error: 'Invalid Pub/Sub push envelope' }, { status: 400 });
  }

  // Optional allowlist: reject envelopes from a subscription we don't expect.
  const allowedSubscription = process.env.PUBSUB_SUBSCRIPTION;
  if (allowedSubscription && envelope.subscription !== allowedSubscription) {
    console.warn('Rejected push from unexpected subscription:', envelope.subscription);
    return NextResponse.json({ error: 'Untrusted subscription' }, { status: 403 });
  }

  const attributes = message.attributes || {};
  const payload = decodeData(message.data);

  // Delivery is at-least-once: de-duplicate on messageId, which is stable
  // across redeliveries of the same message.
  console.log('Pub/Sub message received:', message.messageId);
  console.log('Published at:', message.publishTime);
  // Your code: if (await alreadyProcessed(message.messageId)) return new NextResponse(null, { status: ACK_STATUS });

  // Pub/Sub defines no event catalog — any "event type" is whatever your
  // publisher put in `attributes`. Change the key to match your publisher.
  const eventType = attributes.eventType;
  if (eventType) {
    console.log('Event type attribute:', eventType);
    // Your code: route on your publisher's own attribute values.
  } else if (payload === null) {
    console.log('Attribute-only message (no data):', attributes);
  } else {
    console.log('Payload:', payload);
  }

  // Ack fast. The default ack deadline is 10s; do slow work asynchronously or
  // Pub/Sub redelivers the message.
  return new NextResponse(null, { status: ACK_STATUS });
}
