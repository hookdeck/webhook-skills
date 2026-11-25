// Generated with: worldline-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse, after } from 'next/server';
import {
  CONNECT_EVENTS,
  DIRECT_EVENTS,
  customHeaderMatches,
  loadSecretKeyStore,
  processEvent,
  seenEventIds,
  verifyWorldlineSignature,
  type WorldlineWebhookEvent,
} from '../../../lib/worldline';

// Connect endpoint verification. When an endpoint is created (or activated),
// Connect sends an UNSIGNED GET with a random string in
// X-GCS-Webhooks-Endpoint-Verification and expects exactly that string back as
// plain text. No signature check here on purpose: the GET carries no payload and
// changes no state, it only proves you own the URL. It is not a bypass of POST
// verification. Direct documents no such GET; answering it is harmless and lets
// one handler serve both platforms.
export async function GET(request: Request) {
  const challenge = request.headers.get('x-gcs-webhooks-endpoint-verification');
  if (!challenge) {
    return new Response('Missing X-GCS-Webhooks-Endpoint-Verification header', {
      status: 400,
      headers: { 'content-type': 'text/plain' },
    });
  }
  return new Response(challenge, {
    status: 200,
    headers: { 'content-type': 'text/plain', 'x-content-type-options': 'nosniff' },
  });
}

export async function POST(request: Request) {
  const store = loadSecretKeyStore();
  if (store.size === 0) {
    // Fail closed: never skip verification because the secret is missing.
    console.error('WORLDLINE_WEBHOOK_KEY_ID / WORLDLINE_WEBHOOK_SECRET not set: rejecting webhook');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 });
  }

  const signature = request.headers.get('x-gcs-signature');
  const keyId = request.headers.get('x-gcs-keyid');
  if (!signature || !keyId) {
    return NextResponse.json({ error: 'Missing X-GCS-Signature or X-GCS-KeyId' }, { status: 401 });
  }

  // Look the secret up by key id. An unknown id is rejected; never fall back
  // to "the one secret we have".
  const secret = store.get(keyId);
  if (!secret) {
    console.error(`Unknown X-GCS-KeyId ${keyId}: rejecting webhook`);
    return NextResponse.json({ error: 'Unknown key id' }, { status: 401 });
  }

  // Raw text, not request.json(): the HMAC covers the exact bytes Worldline sent.
  const rawBody = await request.text();
  if (!verifyWorldlineSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  if (!customHeaderMatches(request.headers)) {
    return NextResponse.json({ error: 'Invalid custom header' }, { status: 401 });
  }

  // An empty body also has a valid signature, but it is not an event.
  if (rawBody.length === 0) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  // The wire format is a bare object. Direct's docs render some samples inside
  // a one-element array; unwrap that defensively.
  if (Array.isArray(parsed) && parsed.length === 1) parsed = parsed[0];
  const event = parsed as WorldlineWebhookEvent;
  if (!event || typeof event !== 'object' || typeof event.id !== 'string' || typeof event.type !== 'string') {
    return NextResponse.json({ error: 'Not a Worldline webhook event' }, { status: 400 });
  }

  // The SDKs throw on apiVersion !== "v1". Log and accept instead, so a future
  // version rollout doesn't 4xx every delivery and burn the retries.
  if (event.apiVersion !== 'v1') {
    console.warn(`Unexpected apiVersion ${event.apiVersion} on event ${event.id}`);
  }

  // Direct only: retry-count is unsigned. Observability, never auth or dedupe.
  const retryCount = request.headers.get('retry-count');
  if (retryCount) console.log(`Worldline delivery ${event.id} retry-count=${retryCount}`);

  // Duplicates are normal on both platforms: dedupe on the top-level id.
  if (seenEventIds.has(event.id)) {
    return NextResponse.json({ received: true, id: event.id, duplicate: true });
  }
  seenEventIds.add(event.id);

  // Connect Configuration Center test events have an id prefixed with TEST.
  if (event.id.startsWith('TEST')) {
    console.log(`Worldline test event ${event.id} (${event.type}): not processed`);
    return NextResponse.json({ received: true, id: event.id, test: true });
  }

  if (!CONNECT_EVENTS.has(event.type) && !DIRECT_EVENTS.has(event.type)) {
    console.log(`Ignoring unknown Worldline event type ${event.type}`);
    return NextResponse.json({ received: true, id: event.id, ignored: 'unknown type' });
  }

  // Respond 2xx immediately; after() runs the processing once the response is sent.
  after(() =>
    processEvent(event).catch((err: Error) => console.error('Worldline event processing failed:', err.message)),
  );
  return NextResponse.json({ received: true, id: event.id, type: event.type });
}
