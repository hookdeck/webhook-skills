// Generated with: sparkpost-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '../../../lib/sparkpost-auth';

/**
 * SparkPost event webhooks are NOT signed — there is no HMAC, no signature
 * header and no signing secret. Authentication is credential based
 * (`auth_type`: `none` | `basic` | `oauth2`), and this route fails closed when
 * nothing is configured. See lib/sparkpost-auth.ts.
 */

// ---------------------------------------------------------------------------
// Payload types
//
// A batch is a JSON ARRAY. Each element has a single `msys` key wrapping ONE
// event-class object, which carries the `type`. Most scalar fields are STRINGS
// even when numeric: "timestamp": "1460989507" is Unix SECONDS as a string, and
// so are num_retries, bounce_class and subaccount_id.
// ---------------------------------------------------------------------------

export interface SparkPostEvent {
  type?: string;
  /** Opaque: a large integer for some event types, a UUID for others. */
  event_id?: string;
  /** Unix seconds, as a STRING. */
  timestamp?: string;
  message_id?: string;
  transmission_id?: string;
  rcpt_to?: string;
  raw_rcpt_to?: string;
  campaign_id?: string;
  subaccount_id?: string;
  customer_id?: string;
  rcpt_meta?: Record<string, unknown>;
  rcpt_tags?: string[];
  friendly_from?: string;
  subject?: string;
  template_id?: string;
  // bounce / delay / out_of_band
  bounce_class?: string;
  error_code?: string;
  reason?: string;
  raw_reason?: string;
  num_retries?: string;
  // click
  target_link_url?: string;
  target_link_name?: string;
  user_agent?: string;
  geo_ip?: Record<string, unknown>;
  // spam_complaint
  fbtype?: string;
  report_by?: string;
  report_to?: string;
  // ab_test_event
  ab_test?: Record<string, unknown>;
  // ingest_event
  batch_id?: string;
  number_succeeded?: number;
  number_duplicates?: number;
  number_failed?: number;
  error_type?: string;
  retryable?: boolean;
  // sms_status
  stat_state?: string;
  sms_dst?: string;
  [field: string]: unknown;
}

/** Inbound email delivered by the SEPARATE relay webhooks API. */
export interface SparkPostRelayMessage {
  content?: {
    email_rfc822?: string;
    email_rfc822_is_base64?: boolean;
    headers?: Array<Record<string, string>>;
    html?: string;
    text?: string;
    subject?: string;
    to?: string[];
  };
  customer_id?: string;
  friendly_from?: string;
  msg_from?: string;
  rcpt_to?: string;
  webhook_id?: string;
  protocol?: string;
}

/**
 * One batch entry. `msys` may be EMPTY — that is the documented validation batch
 * `[{"msys":{}}]`, which must still be answered with 200.
 */
export interface SparkPostBatchEntry {
  msys: {
    message_event?: SparkPostEvent;
    track_event?: SparkPostEvent;
    gen_event?: SparkPostEvent;
    unsubscribe_event?: SparkPostEvent;
    relay_event?: SparkPostEvent;
    ab_test_event?: SparkPostEvent;
    ingest_event?: SparkPostEvent;
    relay_message?: SparkPostRelayMessage;
    [wrapperKey: string]: unknown;
  };
}

// The seven event-class wrapper keys. The single key under `msys` says which
// class an event belongs to — NEVER hardcode only `message_event`.
const EVENT_CLASSES = new Set([
  'message_event',
  'track_event',
  'gen_event',
  'unsubscribe_event',
  'relay_event',
  'ab_test_event',
  'ingest_event',
]);

/**
 * Batch-level idempotency.
 *
 * "Each webhook batch contains the header X-MessageSystems-Batch-ID, which is
 * useful for detecting and prevention of processing duplicate batches."
 * A duplicate batch still gets a 200 — "If you get a duplicate batch, return a
 * 200 response so SparkPost will not keep retrying."
 *
 * A module-level Set is fine for a demo but does NOT work across serverless
 * instances. Use Redis or a table with a TTL in production, and dedupe
 * individual events on `event_id` too.
 */
const seenBatchIds = new Set<string>();

export async function POST(request: NextRequest) {
  // 1. AUTHENTICATE FIRST, before touching the body. A malformed body from an
  //    unauthenticated caller must not answer 400 ahead of the credential check.
  //    This applies to the creation/validation test batch too.
  const auth = authenticateRequest(request.headers);

  if (!auth.ok) {
    console.error(`SparkPost webhook rejected: ${auth.reason}`);
    const headers: Record<string, string> = {};
    if (auth.status === 401) {
      // The correct RFC 7617 response to a rejected Basic credential.
      headers['WWW-Authenticate'] = 'Basic realm="sparkpost"';
    }
    return NextResponse.json({ error: auth.reason }, { status: auth.status, headers });
  }

  // 2. Batch-level dedupe. Headers.get() is case-insensitive — needed because
  //    the API reference spells it X-MessageSystems-Batch-ID and the support
  //    docs X-Messagesystems-Batch-Id.
  const batchId = request.headers.get('x-messagesystems-batch-id');

  if (batchId && seenBatchIds.has(batchId)) {
    console.log(`↩︎  Duplicate batch ${batchId} — acknowledging without reprocessing`);
    return new NextResponse('OK', { status: 200 });
  }

  // 3. Read the raw body, then parse. The raw bytes aren't needed for
  //    verification (nothing is signed) but the recommended pattern is "Store
  //    the raw data to disk or S3 and then asyncronously process it."
  const rawBody = await request.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    console.error('SparkPost webhook body was not valid JSON');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body is always a JSON ARRAY of events. A single object is tolerated
  // defensively; anything else is not a SparkPost batch.
  const events: SparkPostBatchEntry[] | null = Array.isArray(parsed)
    ? (parsed as SparkPostBatchEntry[])
    : parsed && typeof parsed === 'object'
      ? [parsed as SparkPostBatchEntry]
      : null;

  if (!events) {
    console.error('SparkPost webhook body was not a JSON array');
    return NextResponse.json({ error: 'Expected a JSON array of events' }, { status: 400 });
  }

  if (batchId) seenBatchIds.add(batchId);

  // 4. Process, then answer 200.
  //
  //    The create/validate test explicitly requires 200, and any non-2xx is
  //    retried: "if you do not return a 200 for the batch we will continue to
  //    resend even if you processed and stored part of the batch". The timeout is
  //    10 seconds, with 12 attempts over 8 hours — so in production persist the
  //    raw batch and enqueue (Next.js `after()`, a queue, or Hookdeck) rather
  //    than doing real work inline.
  try {
    processBatch(events, batchId);
  } catch (err) {
    console.error(`Error processing SparkPost batch ${batchId}:`, err);
    // Still acknowledge — record the failure and reconcile out of band (the
    // Events API can backfill). Never let this turn into a non-200.
  }

  return new NextResponse('OK', { status: 200 });
}

export function processBatch(events: SparkPostBatchEntry[], batchId: string | null): void {
  console.log(`✓ SparkPost batch ${batchId || '(no batch id)'} — ${events.length} entr(y|ies)`);

  for (const entry of events) {
    if (!entry || typeof entry !== 'object' || typeof entry.msys !== 'object' || entry.msys === null) {
      console.warn('Skipping entry without an msys wrapper');
      continue;
    }

    const keys = Object.keys(entry.msys);

    // THE VALIDATION / TEST BATCH. `POST /api/v1/webhooks/{id}/validate` — and
    // the test POST fired when a webhook is created or its target changes —
    // sends literally `[{"msys":{}}]`: an empty msys object with no event class.
    // It must NOT throw, and the response must be 200, or the webhook cannot be
    // created ("your request to the Webhook API will fail with HTTP 400 and the
    // webhook will not be created"). There is no "ping" event type.
    if (keys.length === 0) {
      console.log('🔎 Validation/test batch (empty msys) — acknowledged');
      continue;
    }

    for (const wrapperKey of keys) {
      const payload = entry.msys[wrapperKey];

      // Relay webhooks are a SEPARATE API (/api/v1/relay-webhooks) that delivers
      // INBOUND EMAIL as msys.relay_message. Not to be confused with
      // `relay_event` (relay_injection / relay_delivery / ... status events,
      // which arrive through event webhooks).
      if (wrapperKey === 'relay_message') {
        handleRelayMessage(payload as SparkPostRelayMessage);
        continue;
      }

      if (!EVENT_CLASSES.has(wrapperKey)) {
        // Additive changes are expected: "Webhooks consumers should be flexible
        // enough to accept additive changes to the payload."
        console.log(`❓ Unknown event class '${wrapperKey}' — logged, not failed`);
        continue;
      }

      handleEvent(wrapperKey, (payload as SparkPostEvent) || {});
    }
  }
}

function handleEvent(eventClass: string, event: SparkPostEvent): void {
  const type = event.type;
  const eventId = event.event_id; // opaque: a big integer for some types, a UUID for others

  // TODO: event-level idempotency — skip if you have already stored eventId.

  switch (type) {
    // --- message_event ---
    case 'delivery':
      console.log(`📬 delivery to ${event.rcpt_to} (message_id=${event.message_id}, retries=${event.num_retries})`);
      break;
    case 'bounce':
    case 'out_of_band':
      console.log(`⛔ ${type} for ${event.rcpt_to}: class=${event.bounce_class} code=${event.error_code} — ${event.reason}`);
      // Suppress the address. bounce_class distinguishes hard from soft.
      break;
    case 'injection':
      console.log(`📥 injection accepted for ${event.rcpt_to} (transmission_id=${event.transmission_id})`);
      break;
    case 'delay':
      console.log(`⏳ delay for ${event.rcpt_to}: code=${event.error_code} retries=${event.num_retries}`);
      break;
    case 'spam_complaint':
      console.log(`🚨 spam_complaint from ${event.rcpt_to} (fbtype=${event.fbtype}, report_by=${event.report_by})`);
      // Remove from all mailing lists immediately.
      break;
    case 'policy_rejection':
      console.log(`🚫 policy_rejection for ${event.rcpt_to}: ${event.reason}`);
      break;
    case 'sms_status':
      console.log(`📱 sms_status ${event.stat_state} for ${event.sms_dst}`);
      break;

    // --- track_event ---
    case 'click':
    case 'amp_click':
      console.log(`🖱  ${type} by ${event.rcpt_to} → ${event.target_link_url} (${event.target_link_name})`);
      break;
    case 'open':
    case 'initial_open':
    case 'amp_open':
    case 'amp_initial_open':
      console.log(`👁  ${type} by ${event.rcpt_to}`);
      break;

    // --- gen_event ---
    case 'generation_failure':
    case 'generation_rejection':
      console.log(`⚠️  ${type} for ${event.rcpt_to}: ${event.reason} (template=${event.template_id})`);
      break;

    // --- unsubscribe_event ---
    case 'list_unsubscribe':
    case 'link_unsubscribe':
      console.log(`✋ ${type} by ${event.rcpt_to} (campaign=${event.campaign_id})`);
      break;

    // --- relay_event (status events about inbound relaying) ---
    case 'relay_injection':
    case 'relay_rejection':
    case 'relay_delivery':
    case 'relay_tempfail':
    case 'relay_permfail':
      console.log(`🔁 ${type} (${eventClass}) for ${event.rcpt_to}`);
      break;

    // --- ab_test_event ---
    case 'ab_test_completed':
    case 'ab_test_cancelled': {
      const test = (event.ab_test ?? {}) as Record<string, string | undefined>;
      console.log(`🧪 ${type}: ${test.id} winner=${test.winning_template_id}`);
      break;
    }

    // --- ingest_event ---
    case 'success':
      console.log(`📦 ingest success batch=${event.batch_id} succeeded=${event.number_succeeded} duplicates=${event.number_duplicates}`);
      break;
    case 'error':
      console.log(`📦 ingest error batch=${event.batch_id} type=${event.error_type} failed=${event.number_failed} retryable=${event.retryable}`);
      break;

    default:
      // A type you don't recognise is normal — SparkPost adds event types over
      // time. Log it and keep going; never fail the batch.
      console.log(`❓ Unhandled ${eventClass} type '${type}' (event_id=${eventId})`);
  }
}

/** Inbound email from a RELAY webhook (separate API). */
function handleRelayMessage(message: SparkPostRelayMessage): void {
  const content = message?.content ?? {};
  console.log(`📨 relay_message from ${message?.msg_from} to ${message?.rcpt_to}: ${content.subject}`);
  // content.email_rfc822 holds the full MIME message; check
  // content.email_rfc822_is_base64 before decoding.
}

// SparkPost only ever POSTs. A GET is handy as a liveness probe while wiring up
// the webhook.
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'sparkpost-webhooks' });
}
