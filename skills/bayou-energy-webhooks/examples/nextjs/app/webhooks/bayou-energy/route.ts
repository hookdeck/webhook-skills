// Generated with: bayou-energy-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Bayou Energy signs webhooks per the Standard Webhooks spec:
//   webhook-id         unique message ID
//   webhook-timestamp  Unix seconds when the webhook was sent
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the company's secret after its `whsec_` prefix.
// Body: { event, object }
// ---------------------------------------------------------------------------

interface BayouEvent {
  event: string; // e.g. "new_bill"
  object: Record<string, any>; // the bill or the customer
}

type WebhookHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify a Bayou Energy delivery with the Standard Webhooks library. It checks
 * the timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw
 * body, and compares in constant time against every `v1,` entry.
 */
function verifyBayouWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  secret = process.env.BAYOU_ENERGY_WEBHOOK_SECRET as string
): BayouEvent {
  return new Webhook(secret).verify(rawBody, headers) as BayouEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Bayou payloads carry no event ID, so dedupe on the webhook-id header.
const processedMessageIds = new Set<string>();

function handleEvent(payload: BayouEvent): void {
  const { event, object = {} } = payload;

  switch (event) {
    // --- Bills -------------------------------------------------------------
    case 'new_bill':
      console.log(`New bill ${object.id} for customer ${object.customer_id} (${object.utility})`);
      break;
    case 'updated_bill':
      console.log(`Updated bill ${object.id} for customer ${object.customer_id}`);
      break;
    case 'new_unparsed_bill':
      // Bill found but not parsed yet; object.file_url is a short-lived link.
      console.log(`New unparsed bill ${object.id} for customer ${object.customer_id}`);
      break;

    // --- Customer data readiness -------------------------------------------
    case 'bills_ready':
      console.log(`Bills ready for customer ${object.id}: ${(object.bills_parsed || []).length} parsed`);
      break;
    case 'intervals_ready':
      console.log(
        `Intervals ready for customer ${object.id}: ${object.first_interval_discovered} to ${object.last_interval_discovered}`
      );
      break;

    // --- Customer credentials ----------------------------------------------
    case 'customer_has_filled_credentials':
      console.log(`Customer ${object.id} shared credentials for ${object.utility}`);
      break;
    case 'customer_must_reauthenticate':
      // reason: credentials_are_invalid or mfa_factor_has_expired
      console.log(`Customer ${object.id} must re-authenticate (${object.reason})`);
      break;

    default:
      console.log(`Unhandled Bayou Energy event: ${event}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BAYOU_ENERGY_WEBHOOK_SECRET) {
    console.error('BAYOU_ENERGY_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let payload: BayouEvent;
  try {
    payload = verifyBayouWebhook(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Bayou Energy webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Acknowledge duplicates (same webhook-id) with 200.
  if (processedMessageIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(id);
  } catch (err) {
    console.error('Error handling Bayou Energy event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
