// Generated with: instantly-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * INSTANTLY WEBHOOK AUTHENTICATION
 *
 * Instantly does NOT sign webhooks: no signature header, no HMAC, no
 * timestamp header. You attach custom HTTP headers to the webhook (UI:
 * Integrations -> Webhooks -> "Add headers", or the API v2 `headers` object),
 * e.g. `Authorization: Basic ...` or `X-Instantly-Secret: <random>`.
 * Instantly sends that header unchanged, so compare the WHOLE value, in
 * constant time.
 */

/** Header name to check (Headers.get() is case-insensitive). */
export function headerName(
  env: Record<string, string | undefined> = process.env
): string {
  return (env.INSTANTLY_WEBHOOK_HEADER || 'authorization').trim().toLowerCase();
}

/** Constant-time compare of the received header value. */
export function verifyInstantlyHeader(
  received: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface InstantlyEvent {
  timestamp?: string;
  event_type?: string;
  workspace?: string;
  campaign_id?: string;
  campaign_name?: string;
  lead_email?: string;
  email_account?: string;
  step?: number;
  email_id?: string;
  reply_text_snippet?: string;
  [key: string]: unknown;
}

/** Instantly payloads have no event ID, so derive an idempotency key. */
export function idempotencyKey(payload: InstantlyEvent): string {
  return [
    payload.event_type,
    payload.timestamp,
    payload.campaign_id,
    payload.lead_email,
    payload.step,
    payload.email_id,
  ]
    .map((v) => (v === undefined || v === null ? '' : String(v)))
    .join(':');
}

export async function POST(request: NextRequest) {
  const expected = process.env.INSTANTLY_WEBHOOK_SECRET;

  // Fail closed on misconfiguration: 500, so it's distinguishable from a bad credential.
  if (!expected) {
    console.error('INSTANTLY_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  const name = headerName();
  const received = request.headers.get(name);
  if (!received) {
    return NextResponse.json({ error: `Missing ${name} header` }, { status: 401 });
  }

  if (!verifyInstantlyHeader(received, expected)) {
    console.error(`Instantly webhook ${name} header mismatch`);
    return NextResponse.json({ error: `Invalid ${name} header` }, { status: 401 });
  }

  // Authenticate first, then parse the raw body.
  const body = await request.text();
  let payload: InstantlyEvent;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  console.log(`✓ Authenticated Instantly webhook: ${payload.event_type} (${idempotencyKey(payload)})`);

  handleEvent(payload);

  return NextResponse.json({ received: true });
}

function handleEvent(payload: InstantlyEvent) {
  // TODO: check idempotencyKey(payload) against your store and return if seen.
  const lead = payload.lead_email || 'unknown lead';
  const campaign = payload.campaign_name || payload.campaign_id;

  switch (payload.event_type) {
    // --- Email events -------------------------------------------------------
    case 'email_sent':
      console.log(`📤 Email sent to ${lead} (campaign ${campaign}, step ${payload.step})`);
      break;
    case 'email_opened':
      console.log(`👀 ${lead} opened an email`);
      break;
    case 'email_link_clicked':
    case 'link_clicked': // name used in Instantly's events guide
      console.log(`🔗 ${lead} clicked a link`);
      break;
    case 'reply_received':
      console.log(`💬 Reply from ${lead}: ${payload.reply_text_snippet || ''}`);
      break;
    case 'auto_reply_received':
      console.log(`🤖 Auto-reply from ${lead}`);
      break;
    case 'email_bounced':
      console.log(`⛔ Email to ${lead} bounced`);
      break;
    case 'lead_unsubscribed':
      console.log(`🚫 ${lead} unsubscribed — add to suppression list`);
      break;
    case 'account_error':
      console.log(`⚠️  Sending account error: ${payload.email_account}`);
      break;
    case 'campaign_completed':
      console.log(`🏁 Campaign completed: ${campaign}`);
      break;

    // --- Lead status events -------------------------------------------------
    case 'lead_interested':
      console.log(`🔥 ${lead} is interested`);
      break;
    case 'lead_not_interested':
    case 'lead_neutral':
    case 'lead_closed':
    case 'lead_out_of_office':
    case 'lead_wrong_person':
      console.log(`🏷️  ${lead} status: ${payload.event_type}`);
      break;
    case 'lead_meeting_booked':
      console.log(`📅 Meeting booked with ${lead}`);
      break;
    case 'lead_meeting_completed':
    case 'lead_no_show':
      console.log(`📅 Meeting update for ${lead}: ${payload.event_type}`);
      break;

    default:
      // Custom labels arrive with the label name as event_type, as-is.
      console.log(`Custom label or unhandled Instantly event: ${payload.event_type}`);
  }
}
