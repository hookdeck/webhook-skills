// Generated with: camel-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// camelAI (camelRun) webhooks follow Standard Webhooks:
//   webhook-id         the event id (evt_...), stable across retries
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Hookdeck also accepts the svix-* spelling of the same three headers, so
// this handler does too.
// ---------------------------------------------------------------------------

interface CamelAiEvent {
  id: string; // evt_..., also the webhook-id
  type: string; // e.g. "run.completed"
  created: number; // Unix seconds
  data: Record<string, any>;
}

interface SignatureHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Read the three signature headers, preferring webhook-* and falling back to
 * svix-* when webhook-id is absent (the same rule Hookdeck applies).
 */
function extractSignatureHeaders(headers: Headers): SignatureHeaders {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    id: headers.get(`${prefix}-id`),
    timestamp: headers.get(`${prefix}-timestamp`),
    signature: headers.get(`${prefix}-signature`),
  };
}

/**
 * Verify a camelAI delivery with the Standard Webhooks library. It enforces a
 * fixed 5-minute timestamp window, recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry. The library expects
 * webhook-* names, so the values are passed under those names whichever prefix
 * the request used.
 *
 * Hookdeck retries and replays resend the original timestamp, so a retry later
 * than 5 minutes is rejected here. See references/verification.md for a manual
 * verifier without the window.
 */
function verifyCamelAiWebhook(
  rawBody: string,
  sig: { id: string; timestamp: string; signature: string },
  secret: string
): CamelAiEvent {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': sig.id,
    'webhook-timestamp': sig.timestamp,
    'webhook-signature': sig.signature,
  }) as CamelAiEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Delivery is at least once and the event id is stable across retries.
const processedEventIds = new Set<string>();

function handleEvent(event: CamelAiEvent): void {
  const { type, data = {} } = event; // data fields vary by event type

  switch (type) {
    // --- Runs ----------------------------------------------------------------
    case 'run.started':
    case 'run.completed':
    case 'run.failed':
      console.log(`${type}: event ${event.id}`);
      break;

    // --- Human input ---------------------------------------------------------
    case 'input.requested':
    case 'input.resolved':
      console.log(`${type}: ${JSON.stringify(data)}`);
      break;

    // --- Usage ---------------------------------------------------------------
    case 'usage.recorded':
      console.log(`Usage recorded: ${JSON.stringify(data)}`);
      break;

    // --- Voice sessions ------------------------------------------------------
    case 'voice.session.started':
    case 'voice.session.ended':
    case 'voice.session.error':
    case 'voice.utterance':
    case 'voice.speech.started':
    case 'voice.speech.ended':
      console.log(`${type}: ${JSON.stringify(data)}`);
      break;

    // --- Billing -------------------------------------------------------------
    case 'billing.balance.low':
    case 'billing.balance.depleted':
      console.log(`${type}: ${JSON.stringify(data)}`);
      break;

    // --- End-user credits ----------------------------------------------------
    case 'end_user.balance.low':
    case 'end_user.credit.exhausted':
    case 'end_user.credit.granted':
    case 'end_user.credit.refunded':
    case 'end_user.credit.adjusted':
    case 'end_user.allowance.low':
      console.log(`${type}: ${JSON.stringify(data)}`);
      break;

    default:
      console.log(`Unhandled camelAI event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.CAMEL_AI_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CAMEL_AI_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const { id, timestamp, signature } = extractSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // request.text() gives the exact bytes camelAI sent; parse only after verifying.
  const rawBody = await request.text();

  let event: CamelAiEvent;
  try {
    event = verifyCamelAiWebhook(rawBody, { id, timestamp, signature }, secret);
  } catch (err) {
    console.error('camelAI webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // A correctly signed but empty or non-JSON body is not an event envelope.
  if (!event || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Retries reuse the same event id; acknowledge duplicates with 200.
  const eventId = event.id || id;
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // camelAI needs a 2xx within 10 seconds. In production, enqueue the event
    // here and process it asynchronously. Retries can reorder, so order by
    // event.created (Unix seconds), not arrival.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling camelAI event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
