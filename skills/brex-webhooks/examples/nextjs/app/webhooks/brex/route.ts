// Generated with: brex-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Brex signs webhooks the Standard Webhooks way:
//   Webhook-Id         unique message ID, the same when a message is resent
//   Webhook-Timestamp  Unix seconds of this attempt
//   Webhook-Signature  space-separated "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${Webhook-Id}.${Webhook-Timestamp}.${rawBody}`
// Key: the base64-DECODED secret from GET /v1/webhooks/secrets. Brex's guide
// shows a bare base64 secret; its API reference example shows "whsec_...".
// Strip an optional whsec_ prefix, then base64-decode.
// ---------------------------------------------------------------------------

/** Brex payloads are flat: `event_type` plus IDs to look up with the Brex API. */
export interface BrexEvent {
  event_type: string;
  company_id?: string;
  transfer_id?: string;
  payment_type?: string;
  expense_id?: string;
  payment_status?: string;
  user_id?: string;
  updated_attributes?: string[];
  referral_id?: string;
  accountingRecordIds?: string[]; // ACCOUNTING_RECORD_READY_FOR_EXPORT uses camelCase
  companyId?: string;
  [key: string]: unknown;
}

export interface BrexSignatureHeaders {
  'webhook-id': string | null;
  'webhook-timestamp': string | null;
  'webhook-signature': string | null;
}

/**
 * Verify a Brex delivery. `toleranceSeconds` is an optional freshness window
 * (null = off). Brex's guide recommends one; a delivery replayed later through
 * a relay keeps its original timestamp, so a window rejects it.
 */
export function verifyBrexWebhook(
  rawBody: string | Buffer,
  headers: BrexSignatureHeaders,
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

  // After a key rotation Brex sends one signature per key. Accept any v1 match.
  let ok = false;
  for (const entry of signatureHeader.split(' ')) {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) continue;
    const given = Buffer.from(signature, 'base64');
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) ok = true;
  }
  return ok;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedMessageIds = new Set<string>();

function handleEvent(event: BrexEvent): void {
  switch (event.event_type) {
    case 'TRANSFER_PROCESSED':
      console.log(`Transfer ${event.transfer_id} processed (${event.payment_type})`);
      break;
    case 'TRANSFER_FAILED':
      console.log(`Transfer ${event.transfer_id} failed (${event.payment_type})`);
      break;
    case 'EXPENSE_PAYMENT_UPDATED':
      console.log(`Expense ${event.expense_id}: ${event.payment_status} ${event.payment_type}`);
      break;
    case 'USER_UPDATED':
      console.log(`User ${event.user_id} updated: ${(event.updated_attributes ?? []).join(', ')}`);
      break;
    case 'REFERRAL_CREATED':
    case 'REFERRAL_ACTIVATED':
    case 'REFERRAL_APPLICATION_STATUS_CHANGED':
      console.log(`${event.event_type} for referral ${event.referral_id}`);
      break;
    case 'ACCOUNTING_RECORD_READY_FOR_EXPORT':
      console.log(`${(event.accountingRecordIds ?? []).length} accounting records ready`);
      break;
    default:
      console.log(`Unhandled Brex event type: ${event.event_type}`);
  }
}

export async function POST(request: Request) {
  const secret = process.env.BREX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BREX_WEBHOOK_SECRET is not set: rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers: BrexSignatureHeaders = {
    'webhook-id': request.headers.get('webhook-id'),
    'webhook-timestamp': request.headers.get('webhook-timestamp'),
    'webhook-signature': request.headers.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Read the raw bytes: the signature covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = process.env.BREX_WEBHOOK_TOLERANCE_SECONDS
    ? Number(process.env.BREX_WEBHOOK_TOLERANCE_SECONDS)
    : null;
  if (!verifyBrexWebhook(rawBody, headers, secret, tolerance)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: BrexEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Brex event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
