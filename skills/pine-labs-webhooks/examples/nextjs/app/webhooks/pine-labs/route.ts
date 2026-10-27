// Generated with: pine-labs-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Pine Labs Online signs with the Standard Webhooks headers:
//   webhook-id         event ID (same when the webhook is resent)
//   webhook-timestamp  Unix seconds when the event was triggered
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: the secret key from the Pine Labs dashboard as its raw UTF-8 bytes. Pine Labs'
// docs say to base64-encode the key and then base64-decode it again, which is a no-op.
// Don't use the standardwebhooks or svix libraries: they base64-decode the secret.
// ---------------------------------------------------------------------------

type PineLabsEvent = {
  event_type?: string; // order, customer, token, refund and subscription events
  eventType?: string; // payout events (and some Pay by Points orders)
  data?: any;
  [key: string]: any;
};

type SignatureHeaders = { id: string | null; timestamp: string | null; signature: string | null };

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set PINE_LABS_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.PINE_LABS_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`PINE_LABS_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/** Read webhook-* headers; when webhook-id is absent, use the svix-* headers instead. */
function signatureHeaders(headers: Headers): SignatureHeaders {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    id: headers.get(`${prefix}-id`),
    timestamp: headers.get(`${prefix}-timestamp`),
    signature: headers.get(`${prefix}-signature`),
  };
}

/** Standard Webhooks key: base64-decoded `whsec_` secrets, anything else as raw UTF-8 bytes. */
function signingKey(secret: string): Buffer {
  return secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
}

/** Verify a Standard Webhooks delivery from Pine Labs and throw if it's invalid. */
function verifySignature(
  rawBody: string,
  { id, timestamp, signature }: SignatureHeaders,
  secret: string,
  toleranceSeconds: number = timestampToleranceSeconds()
): void {
  if (!id || !timestamp || !signature) throw new Error('Missing signature headers');
  if (!/^[1-9][0-9]*$/.test(timestamp)) throw new Error('Invalid webhook-timestamp');
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    throw new Error('Timestamp outside tolerance');
  }

  const key = signingKey(secret);
  if (key.length === 0) throw new Error('Empty signing key'); // fail closed
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  // The header is a space-delimited list of "v1,<base64>" entries; any v1 match is valid
  const match = signature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!match) throw new Error('No matching signature');
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// webhook-id is the same when Pine Labs resends an event.
const processedMessageIds = new Set<string>();

function handleEvent(payload: PineLabsEvent): void {
  const type = payload.event_type ?? payload.eventType;
  const data = payload.data ?? {};
  switch (type) {
    case 'CUSTOMER_ACTIVATED':
    case 'CUSTOMER_DELETED':
    case 'CUSTOMER_SUSPENDED':
    case 'CUSTOMER_CREATION_FAILED':
      console.log(`${type}: customer ${data.customer?.customer_id} (${data.customer?.status})`);
      break;
    case 'ORDER_AUTHORIZED':
    case 'ORDER_PROCESSED':
    case 'ORDER_CANCELLED':
    case 'PAYMENT_FAILED':
    case 'ORDER_FAILED':
    case 'ORDER_SETTLED':
    case 'ORDER_SETTLEMENT_REJECTED':
      // Events can arrive out of order (ORDER_PROCESSED before ORDER_AUTHORIZED): don't assume a sequence
      console.log(`${type}: order ${data.order_id} is ${data.status} (${data.order_amount?.value} ${data.order_amount?.currency})`);
      break;
    case 'REFUND_PROCESSED':
    case 'REFUND_FAILED':
      console.log(`${type}: refund ${data.order_id} of order ${data.parent_order_id} is ${data.status}`);
      break;
    case 'TOKEN_ACTIVATED':
    case 'TOKEN_DEACTIVATED':
    case 'TOKEN_SUSPENDED':
    case 'TOKEN_PROVISION_FAILED':
      console.log(`${type}: token ${data.token?.token_id} (${data.token?.status})`);
      break;
    case 'SUBSCRIPTION_ACTIVATED':
    case 'SUBSCRIPTION_PENDING':
    case 'SUBSCRIPTION_PAUSED':
    case 'SUBSCRIPTION_RESUMED':
    case 'SUBSCRIPTION_COMPLETED':
    case 'SUBSCRIPTION_CHARGED':
    case 'SUBSCRIPTION_HALTED':
    case 'SUBSCRIPTION_CANCELLED':
    case 'SUBSCRIPTION_REVOKE_FAILED':
    case 'SUBSCRIPTION_UPDATED':
    case 'SUBSCRIPTION_UPDATE_FAILED':
      console.log(`${type}: subscription ${data.subscription?.subscription_id} (${data.subscription?.status})`);
      break;
    case 'payout-transaction-success':
    case 'payout-transaction-failed':
      console.log(`${type}: payout ${data.clientReferenceId} (${data.paymentReferenceId}) is ${data.status}`);
      break;
    default:
      console.log(`Unhandled Pine Labs event: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.PINE_LABS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PINE_LABS_WEBHOOK_SECRET is not set — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = signatureHeaders(request.headers);
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // request.text() gives the exact bytes Pine Labs sent; request.json() would break the HMAC.
  const rawBody = await request.text();

  let payload: PineLabsEvent;
  try {
    verifySignature(rawBody, headers, secret);
    payload = JSON.parse(rawBody) as PineLabsEvent;
  } catch (err) {
    console.error('Pine Labs webhook verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (retries) — acknowledge with 200.
  if (processedMessageIds.has(headers.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously: Pine Labs
    // wants a 2XX within 5 seconds.
    handleEvent(payload);
    processedMessageIds.add(headers.id);
  } catch (err) {
    console.error('Error handling Pine Labs event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
