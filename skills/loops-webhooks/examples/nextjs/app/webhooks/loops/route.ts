// Generated with: loops-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Loops signs webhooks with three headers:
//   Webhook-Id         unique event ID, use it to skip duplicate deliveries
//   Webhook-Timestamp  seconds since epoch
//   Webhook-Signature  space-separated "v1,<base64 HMAC-SHA256>" entries
//                      (old and new secret both sign for 24h after a roll)
// Signed content: `${Webhook-Id}.${Webhook-Timestamp}.${rawBody}`
// Key: the signing secret from Settings -> Webhooks with an optional whsec_
// prefix stripped, then base64-DECODED (as in Loops' own example).
// ---------------------------------------------------------------------------

export interface LoopsContactIdentity {
  id: string;
  email: string;
  userId: string | null;
}

/** Every body has eventName, eventTime (Unix seconds) and webhookSchemaVersion. */
export interface LoopsEvent {
  eventName: string;
  eventTime: number;
  webhookSchemaVersion: string;
  contactIdentity?: LoopsContactIdentity;
  contact?: Record<string, unknown>;
  mailingList?: { id: string; name: string; description: string | null; isPublic: boolean };
  email?: { id: string; emailMessageId: string; subject: string };
  sourceType?: 'campaign' | 'loop' | 'transactional';
  campaignId?: string;
  loopId?: string; // workflows keep the pre-May 2026 "loop" names
  transactionalId?: string;
  message?: string; // testing.testEvent
  [key: string]: unknown;
}

export interface LoopsSignatureHeaders {
  'webhook-id': string | null;
  'webhook-timestamp': string | null;
  'webhook-signature': string | null;
}

/**
 * Verify a Loops delivery. `toleranceSeconds` is an optional freshness window
 * (null = off). Loops' example enforces 300 seconds; a delivery replayed later
 * through a relay keeps its original timestamp, so a window rejects it.
 */
export function verifyLoopsWebhook(
  rawBody: string | Buffer,
  headers: LoopsSignatureHeaders,
  secret: string | undefined,
  toleranceSeconds: number | null = null
): boolean {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader || !secret) return false;
  if (!/^\d+$/.test(timestamp)) return false;

  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (key.length === 0) return false;
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest();

  // After a secret roll the header carries one signature per secret.
  // Check every v1 entry; any match passes.
  let ok = false;
  for (const entry of signatureHeader.trim().split(/\s+/)) {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) continue;
    const given = Buffer.from(signature, 'base64');
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) ok = true;
  }
  return ok;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedEventIds = new Set<string>();

function handleEvent(event: LoopsEvent): void {
  const who = event.contactIdentity?.email;
  switch (event.eventName) {
    case 'contact.created':
      console.log(`Contact created: ${who}`);
      break;
    case 'contact.unsubscribed':
    case 'contact.deleted':
      console.log(`${event.eventName}: ${who}`);
      break;
    case 'contact.mailingList.subscribed':
    case 'contact.mailingList.unsubscribed':
      console.log(`${event.eventName}: ${who} ${event.mailingList?.name}`);
      break;
    case 'campaign.email.sent':
    case 'loop.email.sent':
    case 'transactional.email.sent':
      console.log(`${event.eventName} to ${who}: ${event.email?.subject}`);
      break;
    case 'email.delivered':
    case 'email.opened':
    case 'email.clicked':
    case 'email.softBounced':
    case 'email.hardBounced':
    case 'email.spamReported':
    case 'email.unsubscribed':
    case 'email.resubscribed':
      console.log(`${event.eventName} (${event.sourceType}) for ${who}`);
      break;
    case 'testing.testEvent':
      console.log(`Loops test event: ${event.message}`);
      break;
    default:
      console.log(`Unhandled Loops event: ${event.eventName}`);
  }
}

export async function POST(request: Request) {
  const secret = process.env.LOOPS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LOOPS_WEBHOOK_SECRET is not set: rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers: LoopsSignatureHeaders = {
    'webhook-id': request.headers.get('webhook-id'),
    'webhook-timestamp': request.headers.get('webhook-timestamp'),
    'webhook-signature': request.headers.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Read the raw bytes: the signature covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = process.env.LOOPS_WEBHOOK_TOLERANCE_SECONDS
    ? Number(process.env.LOOPS_WEBHOOK_TOLERANCE_SECONDS)
    : null;
  if (!verifyLoopsWebhook(rawBody, headers, secret, tolerance)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: LoopsEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The same event can be sent more than once: skip a Webhook-Id already seen.
  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Loops event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
