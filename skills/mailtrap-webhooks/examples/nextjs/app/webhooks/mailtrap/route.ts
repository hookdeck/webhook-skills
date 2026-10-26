// Generated with: mailtrap-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Signature verification needs the Node crypto module and the raw body.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// === Types =================================================================

export interface MailtrapEvent {
  /** delivery, open, click, unsubscribe, spam, "soft bounce", bounce, suspension, reject, or activity_log.* */
  event: string;
  timestamp?: number;
  event_id?: string;
  message_id?: string;
  email?: string;
  [key: string]: unknown;
}

// === Signature verification ================================================

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/**
 * Verify a Mailtrap `Mailtrap-Signature` header.
 *
 * Lowercase hex HMAC-SHA256 of the RAW request body, keyed with the webhook's
 * signing secret (32 hex characters) used as a plain UTF-8 string. Do NOT
 * hex-decode the secret. The body alone is signed, JSON or JSON Lines.
 *
 * The received value is checked against /^[0-9a-f]{64}$/i first because
 * Buffer.from(x, 'hex') silently truncates invalid hex. The hex strings are then
 * compared as equal-length UTF-8 buffers with crypto.timingSafeEqual.
 */
export function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret) return false;
  const received = signature.trim();
  if (!HEX_SHA256.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(received.toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// === Payload parsing =======================================================

/**
 * A delivery is either `{ "events": [...] }` (JSON) or one event object per line
 * (JSON Lines), up to 500 events per request. Throws on malformed input.
 */
export function parseEvents(rawBody: string): MailtrapEvent[] {
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed && Array.isArray(parsed.events)) return parsed.events;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return [parsed]; // single-line JSONL
    throw new Error('Unexpected payload shape');
  } catch (err) {
    if (err instanceof Error && err.message === 'Unexpected payload shape') throw err;
    return rawBody
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

// === Event handling ========================================================

// Dedupe on `event_id`. Use a shared, durable store (Redis, Postgres) in
// production; this Set is per-process.
const processedEventIds = new Set<string>();

function alreadyProcessed(eventId?: string): boolean {
  if (!eventId) return false;
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  return false;
}

function handleEvent(evt: MailtrapEvent): void {
  switch (evt.event) {
    case 'delivery':
      console.log(`Delivered ${evt.message_id} to ${evt.email}`);
      break;
    case 'open':
      console.log(`Opened by ${evt.email}`);
      break;
    case 'click':
      console.log(`Click by ${evt.email}: ${evt.url}`);
      break;
    case 'unsubscribe':
      console.log(`Unsubscribe from ${evt.email}`);
      break;
    case 'spam':
      console.log(`SPAM complaint from ${evt.email}`);
      break;
    case 'soft bounce':
      console.log(`Soft bounce for ${evt.email}: ${evt.response_code} ${evt.bounce_category}`);
      break;
    case 'bounce':
      console.log(`Hard bounce for ${evt.email}: ${evt.response_code} ${evt.bounce_category}`);
      break;
    case 'suspension':
      console.log(`Message suspended for ${evt.email}: ${evt.reason}`);
      break;
    case 'reject':
      console.log(`Message rejected for ${evt.email}: ${evt.reason}`);
      break;
    default:
      if (typeof evt.event === 'string' && evt.event.startsWith('activity_log.')) {
        console.log(`Audit log ${evt.event}: ${evt.description}`);
      } else {
        console.log('Unhandled Mailtrap event:', evt.event);
      }
  }
}

// === Route =================================================================

export async function POST(request: NextRequest) {
  const secret = process.env.MAILTRAP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MAILTRAP_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const signature = request.headers.get('mailtrap-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Mailtrap-Signature header' }, { status: 400 });
  }

  // Raw body: request.text() regardless of the content type
  const rawBody = await request.text();
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let events: MailtrapEvent[];
  try {
    events = parseEvents(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Any non-200 makes Mailtrap retry (40 times, every 5 minutes).
  for (const evt of events) {
    if (alreadyProcessed(evt.event_id)) continue;
    try {
      handleEvent(evt);
    } catch (err) {
      console.error('Error handling Mailtrap event:', err);
    }
  }
  return NextResponse.json({ received: true });
}
