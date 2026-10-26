// Generated with: axilio-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Axilio signs deliveries with Standard Webhooks:
//   webhook-id         unique message identifier (equals the body's `id`)
//   webhook-timestamp  Unix seconds when the delivery was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
//
// Axilio shows the secret once, when you register the destination.
// ---------------------------------------------------------------------------

interface AxilioEvent {
  id: string; // "<type>:<resource id>[:<time>]", same as the webhook-id header
  type: string; // e.g. "run.completed"
  occurred_at: string; // UTC time of the change
  test: boolean; // true only for dashboard test deliveries
  data: Record<string, any>; // the resource, with API field names
}

type AxilioHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify an Axilio delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * Retries and replays resend the ORIGINAL timestamp, so this rejects a retry
 * that lands more than 5 minutes after the first attempt. See
 * references/verification.md for a manual verifier with a configurable window.
 */
function verifyAxilioWebhook(
  rawBody: string,
  headers: AxilioHeaders,
  secret: string | undefined = process.env.AXILIO_WEBHOOK_SECRET
): AxilioEvent {
  if (!secret) throw new Error('AXILIO_WEBHOOK_SECRET is not set');
  return new Webhook(secret).verify(rawBody, headers) as AxilioEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The body `id` (= webhook-id) is the same every time one change is delivered.
const processedEventIds = new Set<string>();

function handleEvent(event: AxilioEvent): void {
  // `data` uses the API's field names and carries ids, statuses, reasons and
  // timestamps only.
  const { type, data } = event;

  if (event.test) {
    // Sent from the dashboard's Test button: acknowledge, don't act on it.
    console.log(`Test delivery received: ${type}`);
    return;
  }

  switch (type) {
    // --- Runs (data.id = run id) --------------------------------------------
    case 'run.started':
      console.log(`Run ${data.id} started`);
      break;
    case 'run.completed':
      // Fetch the run through the API for outputs; the payload has none.
      console.log(`Run ${data.id} completed`);
      break;
    case 'run.failed':
      console.log(`Run ${data.id} failed`);
      break;
    case 'run.cancelled':
      // data.reason is "user" or "queue_timeout".
      console.log(`Run ${data.id} cancelled (${data.reason})`);
      break;

    // --- Sessions -----------------------------------------------------------
    case 'session.started':
      console.log(`Session ${data.session_id} started`);
      break;
    case 'session.ended':
      // data.end_reason: released, idle_timeout, max_duration, run_finished, device_lost.
      console.log(`Session ${data.session_id} ended (${data.end_reason})`);
      break;
    case 'session.recording_ready':
      console.log(`Recording ready for session ${data.session_id}`);
      break;

    // --- Billing ------------------------------------------------------------
    case 'balance.low':
    case 'balance.depleted':
    case 'balance.recovered':
      console.log(`${type}: balance ${data.balance_display}`);
      break;
    case 'invoice.paid':
    case 'invoice.payment_failed':
      console.log(`${type}: invoice ${data.stripe_invoice_id}`);
      break;
    case 'subscription.updated':
    case 'subscription.canceled':
      console.log(`${type}: subscription ${data.subscription_id} is ${data.status}`);
      break;
    case 'auto_recharge.succeeded':
    case 'auto_recharge.failed':
      // After a failure Axilio turns auto-recharge off until you re-enable it.
      console.log(`${type}: invoice ${data.stripe_invoice_id}`);
      break;

    // --- Files --------------------------------------------------------------
    case 'file.ready':
    case 'file.capture_failed':
    case 'file.delivered':
    case 'file.delivery_failed':
      console.log(`${type}: file ${data.file_id || data.id}`);
      break;

    // --- Phones (rented phones only) ----------------------------------------
    case 'phone.maintenance_started':
    case 'phone.maintenance_ended':
    case 'phone.offline':
    case 'phone.online':
      console.log(`${type}: phone ${data.phone_id}`);
      break;
    case 'phone.rental.activated':
    case 'phone.rental.past_due':
    case 'phone.rental.canceled':
      console.log(`${type}: rental ${data.id}`);
      break;

    case 'webhook.test':
      console.log('webhook.test received');
      break;

    default:
      // Axilio may add event types over time.
      console.log(`Unhandled Axilio event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.AXILIO_WEBHOOK_SECRET) {
    console.error('AXILIO_WEBHOOK_SECRET is not set, rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC. Reading
  // text works for any content type.
  const rawBody = await request.text();

  let event: AxilioEvent;
  try {
    event = verifyAxilioWebhook(rawBody, {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': webhookSignature,
    });
  } catch (err) {
    console.error('Axilio webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Redelivery is normal (at-least-once delivery, replays from the dashboard).
  if (processedEventIds.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Respond 2xx quickly. In production, store or enqueue the event here and
    // do slow work afterwards.
    handleEvent(event);
    processedEventIds.add(event.id);
  } catch (err) {
    console.error('Error handling Axilio event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
