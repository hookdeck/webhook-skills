// Generated with: axilio-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Axilio signs webhooks with the Standard Webhooks scheme:
//   webhook-id         unique per event (same value as the body's `id`)
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the destination's secret after its `whsec_` prefix.
// Each Axilio destination has its own signing secret.
// ---------------------------------------------------------------------------

interface AxilioEvent {
  id: string; // "<type>:<resource id>[:<time>]", equals the webhook-id header
  type: string; // e.g. "run.completed"
  occurred_at: string; // UTC; use it to order events
  test: boolean; // true only for dashboard tests
  data: Record<string, any>;
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the three signature headers. Axilio sends webhook-*; if webhook-id is
 * absent the svix-* equivalents are used instead (Hookdeck does the same).
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
 * Verify an Axilio delivery with the Standard Webhooks library. It recomputes
 * the HMAC over the raw body, compares in constant time against every `v1,`
 * entry, and rejects timestamps more than 5 minutes from now. Hookdeck retries
 * and replays resend the ORIGINAL timestamp, so late retries fail this window;
 * references/verification.md has a manual verifier where it can be widened.
 */
function verifyAxilioWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.AXILIO_WEBHOOK_SECRET as string
): AxilioEvent {
  return new Webhook(secret).verify(rawBody, headers) as AxilioEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The body `id` equals the webhook-id header and is stable across retries.
const processedEventIds = new Set<string>();

function handleEvent(event: AxilioEvent): void {
  const { type, data = {} } = event;

  switch (type) {
    // --- Runs --------------------------------------------------------------
    case 'run.started':
    case 'run.completed':
    case 'run.failed':
      console.log(`${type}: run ${data.id} (workflow ${data.workflow_id}, status ${data.status})`);
      break;
    case 'run.cancelled':
      // reason is `user` or `queue_timeout`
      console.log(`run.cancelled: run ${data.id} (${data.reason})`);
      break;

    // --- Sessions ----------------------------------------------------------
    case 'session.started':
      console.log(`session.started: ${data.session_id} on phone ${data.phone_id}`);
      break;
    case 'session.ended':
      // end_reason: released, idle_timeout, max_duration, run_finished, device_lost
      console.log(`session.ended: ${data.session_id} (${data.end_reason})`);
      break;
    case 'session.recording_ready':
      console.log(`session.recording_ready: ${data.session_id}`);
      break;

    // --- Billing -----------------------------------------------------------
    case 'balance.low':
    case 'balance.depleted':
    case 'balance.recovered':
      console.log(`${type}: balance ${data.balance_display} (alert ${data.alert_id})`);
      break;
    case 'invoice.paid':
    case 'invoice.payment_failed':
      console.log(`${type}: ${data.invoice_number} (${data.amount_microdollars} microdollars)`);
      break;
    case 'subscription.updated':
    case 'subscription.canceled':
      console.log(`${type}: ${data.plan_name} is ${data.status}`);
      break;
    case 'auto_recharge.succeeded':
    case 'auto_recharge.failed':
      console.log(`${type}: invoice ${data.stripe_invoice_id}`);
      break;

    // --- Files -------------------------------------------------------------
    case 'file.ready':
    case 'file.capture_failed':
    case 'file.delivered':
    case 'file.delivery_failed':
      console.log(`${type}: ${data.filename} (${data.id})`);
      break;

    // --- Phones (rented phones only) ---------------------------------------
    case 'phone.maintenance_started':
    case 'phone.maintenance_ended':
    case 'phone.offline':
    case 'phone.online':
      console.log(`${type}: phone ${data.phone_id} (${data.reason ?? data.status})`);
      break;
    case 'phone.rental.activated':
    case 'phone.rental.past_due':
    case 'phone.rental.canceled':
      console.log(`${type}: rental ${data.id} for phone ${data.phone_id}`);
      break;

    // --- Platform ----------------------------------------------------------
    case 'webhook.test':
      console.log('webhook.test received');
      break;

    default:
      console.log(`Unhandled Axilio event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.AXILIO_WEBHOOK_SECRET) {
    console.error('AXILIO_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = signatureHeaders(request.headers);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: AxilioEvent;
  try {
    event = verifyAxilioWebhook(rawBody, headers as SignatureHeaders);
  } catch (err) {
    console.error('Axilio webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // At-least-once delivery: retries reuse the same id; acknowledge duplicates.
  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    // Order is not guaranteed: compare event.occurred_at when it matters.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Axilio event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
