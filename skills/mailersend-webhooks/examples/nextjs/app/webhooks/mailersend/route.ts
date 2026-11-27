// Generated with: mailersend-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * MailerSend signs its URL-validation ping with this FIXED, PUBLICLY DOCUMENTED
 * secret instead of your webhook's signing secret.
 *
 * You must accept it: if the ping doesn't get a 2xx, MailerSend refuses to save
 * the webhook at all.
 *
 * But because it is public, ANYONE can produce a request that verifies against
 * it. A `webhook.test` request therefore proves nothing about the sender, and a
 * test-secret signature must never authorise a real event.
 *
 * https://developers.mailersend.com/api/v1/account/webhooks.html#security
 */
export const MAILERSEND_TEST_SECRET = 'test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G';

// Signature verification needs the Node crypto module and the raw body.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// === Types =================================================================

export interface MailerSendActivityData {
  id: string;
  domain_id: string;
  message_id: string;
  email_id: string;
  /** The BARE activity name (`sent`, `hard_bounced`) — no `activity.` prefix. */
  type: string;
  subject: string;
  /** The recipient's address (webhook payload version 2). */
  recipient: string;
  tags: string[];
  /** `[]` when there is nothing to report, an object otherwise. */
  meta: Record<string, unknown> | unknown[];
}

/** Real events carry `data`; the `webhook.test` ping carries `message` instead. */
export interface MailerSendEvent {
  type: string;
  created_at: string;
  data?: Partial<MailerSendActivityData> & Record<string, unknown>;
  message?: string;
}

// === Signature verification ================================================

/**
 * Constant-time comparison of two hex digest strings.
 *
 * We compare the hex STRINGS rather than hex-decoding both sides, because
 * `Buffer.from('zz', 'hex')` silently truncates to an empty buffer — decoding
 * first can make garbage input compare equal-length.
 *
 * The length check is required: `crypto.timingSafeEqual` THROWS on a length
 * mismatch. A digest's length is public, so short-circuiting on it leaks nothing.
 */
export function timingSafeEqualHex(received: string, expected: string): boolean {
  const a = Buffer.from(String(received).trim().toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify a MailerSend `Signature` header.
 *
 * MailerSend sends the bare lowercase hex HMAC-SHA256 of the RAW request body,
 * keyed with the webhook's signing secret. There is no timestamp, no nonce, no
 * version prefix and no field concatenation — the body alone is signed.
 */
export function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret || rawBody === undefined || rawBody === null) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  return timingSafeEqualHex(signature, expected);
}

// === Payload helpers =======================================================

/**
 * Parse MailerSend's `created_at`, which arrives in TWO documented formats:
 *   "2025-08-05T21:23:54.000000Z"  activity + inbound events, and webhook.test
 *   "2025-08-05 22:27:14"          sender_identity.verified, maintenance.*
 *
 * The second form is not valid ISO-8601. `new Date()` treats it as LOCAL time
 * where it parses at all, so normalise it to UTC explicitly.
 */
export function parseCreatedAt(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `data.meta` is an empty ARRAY (`[]`) when there is nothing to report, and an
 * object otherwise. Normalise so downstream code always sees an object.
 */
export function normalizeMeta(meta: unknown): Record<string, unknown> {
  if (Array.isArray(meta)) return {};
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
}

// === Event handling ========================================================

/**
 * MailerSend sends no delivery id, timestamp or nonce, so transport-level
 * replay protection is impossible. Dedupe on `type` plus `data.id` instead:
 * `data.id` alone is shared by e.g. activity.opened and activity.opened_unique,
 * and some events (maintenance.*, reputation changes) have no `data.id` at all. Use a shared,
 * durable store (Redis, Postgres) in production — an in-memory Set is per-instance
 * and lost on every serverless cold start.
 */
const processedEventIds = new Set<string>();

function alreadyProcessed(eventId: unknown): boolean {
  if (typeof eventId !== 'string' || !eventId) return false;
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  return false;
}

/**
 * Dispatch a verified MailerSend event.
 *
 * NOTE: `data.type` is the BARE activity name (`sent`, `hard_bounced`) with no
 * `activity.` prefix. The top-level `type` is the fully-qualified event name —
 * switch on that.
 */
export function handleEvent(event: MailerSendEvent): void {
  const data = event.data ?? {};
  const meta = normalizeMeta(data.meta);
  const occurredAt = parseCreatedAt(event.created_at);

  switch (event.type) {
    // --- Activity events ---------------------------------------------------
    case 'activity.sent':
      console.log(`Sent to ${data.recipient} (message ${data.message_id})`);
      // Your code: mark queued -> sent
      break;

    case 'activity.delivered':
      console.log(`Delivered to ${data.recipient} at ${occurredAt?.toISOString()}`);
      // Your code: confirm delivery
      break;

    case 'activity.soft_bounced':
      console.log(`Soft bounce for ${data.recipient}`, meta);
      // Your code: count consecutive soft bounces; suppress after a threshold
      break;

    case 'activity.hard_bounced':
      console.log(`HARD bounce for ${data.recipient}`, meta);
      // Your code: suppress this address immediately — it will never deliver
      break;

    case 'activity.deferred':
      // Paid plans only
      console.log(`Deferred for ${data.recipient}`, meta);
      break;

    case 'activity.opened':
    case 'activity.opened_unique':
      console.log(`Open (${event.type}) by ${data.recipient}`);
      // Your code: engagement scoring. `opened` fires per open, `opened_unique` once
      break;

    case 'activity.clicked':
    case 'activity.clicked_unique':
      console.log(`Click (${event.type}) by ${data.recipient}`, meta);
      // Your code: link analytics. `clicked` fires per click, `clicked_unique` once
      break;

    case 'activity.unsubscribed':
      console.log(`Unsubscribe from ${data.recipient}`);
      // Your code: update consent and stop sending
      break;

    case 'activity.spam_complaint':
      console.log(`SPAM COMPLAINT from ${data.recipient}`);
      // Your code: suppress immediately — this damages sending reputation
      break;

    case 'activity.survey_opened':
    case 'activity.survey_submitted':
      console.log(`Survey event ${event.type} for ${data.recipient}`, meta);
      break;

    // --- Account and platform events ---------------------------------------
    case 'sender_identity.verified':
      // NOTE: created_at is space-separated for this event
      console.log('Sender identity verified', data);
      break;

    case 'maintenance.start':
      console.log('MailerSend maintenance started', occurredAt?.toISOString());
      // Your code: pause non-urgent sends
      break;

    case 'maintenance.end':
      console.log('MailerSend maintenance ended', occurredAt?.toISOString());
      // Your code: resume sends
      break;

    case 'inbound_forward.failed':
      console.log('Inbound forward failed', data);
      break;

    case 'inbound_message.rejected':
      // Documented reasons: unsupported_attachment_type, attachment_size_exceeded
      console.log('Inbound message rejected', data);
      break;

    case 'email_single.verified':
    case 'email_list.verified':
      console.log(`Verification finished: ${event.type}`, data);
      break;

    case 'bulk_email.completed':
      console.log('Bulk email completed', data);
      break;

    case 'recipient.on_hold_added':
      console.log(`Recipient placed on hold: ${data.email ?? ''}`, data);
      break;

    case 'recipient.on_hold_removed':
      console.log(`Recipient removed from hold: ${data.email ?? ''}`, data);
      break;

    // --- SMS events (configured separately under SMS -> Webhooks, but the
    //     security model is identical, so one handler can serve both) --------
    case 'sms.sent':
    case 'sms.delivered':
    case 'sms.failed':
      console.log(`SMS event ${event.type}`, data);
      break;

    default:
      console.log('Unhandled MailerSend event type:', event.type);
  }
}

// === Route handler =========================================================

export async function POST(req: NextRequest) {
  const secret = process.env.MAILERSEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MAILERSEND_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Header is exactly `Signature` — no `X-` prefix, no vendor prefix.
  // Headers.get() is case-insensitive.
  const signature = req.headers.get('signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Signature header' }, { status: 400 });
  }

  // CRITICAL: the signature covers the exact raw bytes. Read the body as text
  // and verify it BEFORE calling req.json() — a parsed-then-re-serialised body
  // produces a different digest.
  const rawBody = await req.text();

  const signedByWebhookSecret = verifySignature(rawBody, signature, secret);
  // Only try the public test secret if the real one didn't match
  const signedByTestSecret =
    !signedByWebhookSecret && verifySignature(rawBody, signature, MAILERSEND_TEST_SECRET);

  if (!signedByWebhookSecret && !signedByTestSecret) {
    // 401: an authentication failure, not a malformed request. Either way
    // MailerSend does not retry non-429 4xx, so this gets exactly one attempt.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: MailerSendEvent;
  try {
    event = JSON.parse(rawBody) as MailerSendEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The URL-validation ping. Its envelope has `message`, NOT `data`, so it has
  // to be handled before anything touches event.data. It must get a 2xx or
  // MailerSend refuses to save the webhook.
  if (event.type === 'webhook.test') {
    console.log('MailerSend webhook.test ping:', event.message);
    // Deliberately no privileged work here — the test secret is public.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (signedByTestSecret) {
    // A real event signed with the PUBLIC test secret is a forgery attempt.
    console.warn(`Rejected ${event.type} signed with the public test secret`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const dedupeKey = event.data?.id ? `${event.type}:${event.data.id}` : null;
  if (alreadyProcessed(dedupeKey)) {
    console.log(`Duplicate event ${dedupeKey}, skipping`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    // MailerSend fails the attempt after 3 seconds. Keep this fast — enqueue
    // anything slow (waitUntil, a queue, a background worker) instead of
    // awaiting it here.
    handleEvent(event);
  } catch (err) {
    console.error('Error handling MailerSend event:', err);
    // Returning 500 asks MailerSend to retry (5xx IS retried, unlike 4xx).
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
