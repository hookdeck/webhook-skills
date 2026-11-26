// Generated with: flutterwave-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { dedupeKey, verifyFlutterwaveWebhook, type FlutterwaveEvent } from '../../../lib/verify-flutterwave';

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedKeys = new Set<string>();

function handleEvent(event: FlutterwaveEvent): void {
  const name = event.type ?? event.event; // v4 uses `type`, v3 uses `event`
  const data = event.data ?? {};
  switch (name) {
    case 'charge.completed':
      // Re-query the charge through the API before giving value.
      console.log(`Charge ${data.id} ${data.status}: ${data.amount} ${data.currency}`);
      break;
    case 'transfer.disburse': // v4
    case 'transfer.completed': // v3
      console.log(`Transfer ${data.id} ${data.status}`);
      break;
    case 'transfer.reversal':
      console.log(`Transfer ${data.id} reversed`);
      break;
    case 'refund.completed':
      console.log(`Refund ${data.id} ${data.status} for charge ${data.charge_id}`);
      break;
    case 'subscription.cancelled':
      console.log(`Subscription cancelled for ${data.customer?.email}`);
      break;
    case undefined:
      // Some v3 payloads have no event field: virtual card notifications and refunds.
      if (event.CardId) console.log(`Virtual card ${event.CardId}: ${event.Type} ${event.Status}`);
      else if (event.AmountRefunded !== undefined) console.log(`Refund ${event.id} ${event.status}`);
      else console.log('Flutterwave webhook without an event type');
      break;
    default:
      console.log(`Unhandled Flutterwave event: ${name}`);
  }
}

export async function POST(request: Request) {
  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
  if (!secretHash) {
    console.error('FLUTTERWAVE_SECRET_HASH is not set: rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the v4 signature covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const version = verifyFlutterwaveWebhook(rawBody, request.headers, secretHash);
  if (!version) {
    // Flutterwave's samples return 401 for a bad signature.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: FlutterwaveEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const key = dedupeKey(event, rawBody);
  if (processedKeys.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Respond within 60 seconds: verify, enqueue, return 200, work asynchronously.
    handleEvent(event);
    processedKeys.add(key);
  } catch (err) {
    console.error('Error handling Flutterwave event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // Exactly 200: Flutterwave treats any other status, 201 and 3xx included, as a failure.
  return NextResponse.json({ received: true, version });
}
