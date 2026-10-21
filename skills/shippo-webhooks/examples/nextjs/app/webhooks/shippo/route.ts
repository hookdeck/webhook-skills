// Generated with: shippo-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Reject signatures older than this (Shippo doesn't document a window; 5 minutes is our default).
// Set SHIPPO_TIMESTAMP_TOLERANCE_SECONDS=0 to turn the check off, e.g. when retries or replays
// arrive later than the window (Hookdeck re-delivers the original signature).
const TIMESTAMP_TOLERANCE_SECONDS = Number(process.env.SHIPPO_TIMESTAMP_TOLERANCE_SECONDS ?? 300);

type VerifyResult = { valid: true } | { valid: false; error: string };

interface ShippoWebhookPayload {
  event: string;
  test?: boolean;
  data?: any;
}

/**
 * Verify the Shippo-Auth-Signature header.
 * Format: "t=<unix timestamp>,v1=<hex HMAC-SHA256>"
 * Signed content: "<t>.<raw body>", keyed with the HMAC secret Shippo provisioned.
 */
function verifyShippoSignature(rawBody: string, header: string, secret: string): VerifyResult {
  const parts = header.split(',').map((part) => {
    const i = part.indexOf('=');
    return i === -1 ? [part.trim(), ''] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  });
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);

  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return { valid: false, error: 'Malformed Shippo-Auth-Signature header' };
  }

  // Replay protection
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (TIMESTAMP_TOLERANCE_SECONDS > 0 && age > TIMESTAMP_TOLERANCE_SECONDS) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const match = signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
      return false; // Different lengths = invalid
    }
  });

  return match ? { valid: true } : { valid: false, error: 'Invalid signature' };
}

// Verify the self-generated token appended to the webhook URL (?token=...)
function verifyUrlToken(received: string | null, expected: string): boolean {
  if (!received) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const secret = process.env.SHIPPO_WEBHOOK_SECRET;
  const token = process.env.SHIPPO_WEBHOOK_TOKEN;

  if (!secret && !token) {
    console.error('Set SHIPPO_WEBHOOK_SECRET (HMAC) and/or SHIPPO_WEBHOOK_TOKEN (URL token)');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // URL token check (fallback when HMAC isn't enabled; can be combined with HMAC)
  if (token && !verifyUrlToken(new URL(request.url).searchParams.get('token'), token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // Read the RAW body; don't parse JSON before verifying
  const rawBody = await request.text();

  // HMAC check (only sent once Shippo has provisioned a secret for your account)
  if (secret) {
    const signatureHeader = request.headers.get('shippo-auth-signature');
    if (!signatureHeader) {
      return NextResponse.json({ error: 'Missing Shippo-Auth-Signature header' }, { status: 400 });
    }
    const result = verifyShippoSignature(rawBody, signatureHeader, secret);
    if (!result.valid) {
      console.error('Shippo signature verification failed:', result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  let payload: ShippoWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { event, data, test } = payload;
  console.log(`Received Shippo webhook: ${event}${test ? ' (test)' : ''}`);

  // Respond within 3 seconds; move slow work to a queue.
  // Shippo sends no event ID, so dedupe on natural keys.
  switch (event) {
    case 'track_updated':
      console.log('Tracking updated:', data?.tracking_number, data?.tracking_status?.status);
      // TODO: update order status, notify customer on DELIVERED / FAILURE
      break;
    case 'transaction_created':
      console.log('Transaction created:', data?.object_id, data?.tracking_number);
      // TODO: store label_url and tracking number
      break;
    case 'transaction_updated':
      console.log('Transaction updated:', data?.object_id, data?.status);
      // TODO: sync label/transaction state
      break;
    case 'batch_created':
      console.log('Batch created:', data);
      // TODO: review and purchase the batch
      break;
    case 'batch_purchased':
      console.log('Batch purchased:', data);
      // TODO: download merged label PDFs
      break;
    case 'automations_label_resolved':
      console.log('Automations label resolved:', data?.request_id, data?.status);
      // TODO: dedupe on request_id; fulfil or alert on failure
      break;
    default:
      console.log('Unhandled Shippo event:', event);
  }

  return NextResponse.json({ received: true, event });
}
