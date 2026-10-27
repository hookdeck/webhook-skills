// Generated with: bayou-energy-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Bayou Energy signs webhooks per the Standard Webhooks spec:
//   webhook-id         unique message ID (stable across retries)
//   webhook-timestamp  Unix seconds when the message was sent
//   webhook-signature  one or more space-separated "v1,<base64>" entries
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`, HMAC-SHA256.
// Key: base64-decode of the company secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

interface BayouEvent {
  event: string; // e.g. "new_bill"
  object: Record<string, any>; // the bill or the customer
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the three signature headers. Bayou sends webhook-*; like Hookdeck, fall
 * back to the svix-* names when webhook-id is absent. The result always uses
 * the webhook-* names, which is what the standardwebhooks library expects.
 */
function signatureHeaders(headers: Headers): Partial<SignatureHeaders> {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`) ?? undefined,
    'webhook-timestamp': headers.get(`${prefix}-timestamp`) ?? undefined,
    'webhook-signature': headers.get(`${prefix}-signature`) ?? undefined,
  };
}

/**
 * Verify a Bayou delivery with the Standard Webhooks library. It enforces a
 * fixed 5-minute timestamp window, recomputes the HMAC over the raw body and
 * compares in constant time against every `v1,` entry.
 *
 * Hookdeck retries and replays resend the ORIGINAL timestamp, so this rejects
 * a retry that arrives more than 5 minutes after the first attempt. See
 * references/verification.md for a manual verifier with a configurable window.
 */
function verifyBayouWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.BAYOU_ENERGY_WEBHOOK_SECRET as string
): BayouEvent {
  return new Webhook(secret).verify(rawBody, headers) as BayouEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Bayou payloads carry no event ID, so dedupe on the webhook-id header.
const processedMessageIds = new Set<string>();

// Avoid logging object.file_url (pre-signed bill URL) or object.onboarding_token.
function handleEvent(payload: BayouEvent): void {
  const { event, object = {} } = payload;

  switch (event) {
    case 'new_bill':
    case 'updated_bill':
      console.log(
        `${event}: bill ${object.id} for customer ${object.customer_id} (${object.utility}), ` +
          `total ${object.total_amount}, status ${object.status}`
      );
      break;
    case 'bills_ready':
      // object is the customer; bills_parsed holds the initial bills.
      console.log(`Bills ready for customer ${object.id}: ${(object.bills_parsed || []).length} bills`);
      break;
    case 'intervals_ready':
      console.log(
        `Intervals ready for customer ${object.id}: ` +
          `${object.first_interval_discovered} to ${object.last_interval_discovered}`
      );
      break;
    case 'customer_has_filled_credentials':
      console.log(`Customer ${object.id} shared ${object.utility} credentials`);
      break;
    case 'new_unparsed_bill':
      // The bill exists but isn't parsed yet; wait for updated_bill.
      console.log(`Unparsed bill ${object.id} for customer ${object.customer_id} (${object.utility})`);
      break;
    case 'customer_must_reauthenticate':
      // reason: credentials_are_invalid or mfa_factor_has_expired
      console.log(`Customer ${object.id} must re-authenticate: ${object.reason}`);
      break;
    default:
      console.log(`Unhandled Bayou event: ${event}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BAYOU_ENERGY_WEBHOOK_SECRET) {
    console.error('BAYOU_ENERGY_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = signatureHeaders(request.headers);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let payload: BayouEvent;
  try {
    payload = verifyBayouWebhook(rawBody, headers as SignatureHeaders);
  } catch (err) {
    console.error('Bayou webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Bayou event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
