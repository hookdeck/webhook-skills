// Generated with: cerebrum-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// Cerebrum delivers webhooks through Svix (Standard Webhooks):
//   svix-id         unique message ID (stable across retries)
//   svix-timestamp  Unix seconds when the attempt was sent
//   svix-signature  one or more space-separated "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${id}.${timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// The same three values can arrive as webhook-id / webhook-timestamp /
// webhook-signature; Hookdeck reads either set, and so does this handler.
// ---------------------------------------------------------------------------

// Payload schema: { id, idType, additionalMetadata, event, eventDate, svixAppId, metadata }
// `metadata.delta` is a JSON-Patch-style change list on some order updates.
interface CerebrumEvent {
  id: string;
  idType: string;
  additionalMetadata?: Record<string, unknown>;
  event: string; // e.g. "ORDER_STATUS_CHANGE"
  eventDate: string;
  svixAppId?: string;
  metadata?: { delta?: unknown[] } & Record<string, unknown>;
}

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Pick one complete set of signature headers. svix-* wins when svix-id is
 * present, otherwise webhook-* is used (the same rule Hookdeck applies).
 * Returns the three values under the names the svix library reads, or null
 * if any of them is missing.
 */
function getSignatureHeaders(headers: Headers): SvixHeaders | null {
  const prefix = headers.get('svix-id') ? 'svix' : 'webhook';
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signature = headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature };
}

/**
 * Verify a Cerebrum delivery with the svix library. It recomputes the
 * HMAC-SHA256 over `{id}.{timestamp}.{rawBody}`, compares every `v1,` entry in
 * constant time, and rejects timestamps more than 5 minutes from now. The
 * 5-minute window also applies to Hookdeck retries and replays, which resend
 * the original timestamp; see references/verification.md for a manual verifier
 * without the window.
 */
function verifyCerebrumWebhook(rawBody: string, headers: SvixHeaders, secret: string): CerebrumEvent {
  // svix 2.x verify() returns nothing, so parse after it passes.
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody) as CerebrumEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Dedupe on the message ID header: it is the same on every retry.
const processedMessageIds = new Set<string>();

function handleEvent(payload: CerebrumEvent): void {
  const { event, id, idType, metadata } = payload;

  switch (event) {
    // --- Orders ------------------------------------------------------------
    case 'ORDER_STATUS_CHANGE':
    case 'ORDER_SCORE_CHANGE':
    case 'ORDER_CUSTOM_SCORE_CHANGE':
      console.log(`${event}: ${idType} ${id}`, metadata?.delta ? `(${metadata.delta.length} changes)` : '');
      break;
    case 'ORDER_DISPUTE_RESOLVED':
      console.log(`Order dispute resolved: ${idType} ${id}`);
      break;

    // --- Vouchers (vID) ----------------------------------------------------
    case 'VOUCHER_STARTED':
    case 'VOUCHER_REDEEMED':
    case 'VOUCHER_EXPIRED':
      console.log(`${event}: ${idType} ${id}`);
      break;

    // --- Monitoring and Beam -----------------------------------------------
    case 'MONITORING_REPORT_GENERATED':
      console.log(`Monitoring report generated: ${idType} ${id}`);
      break;
    case 'BEAM_INPUT_CREATED':
      console.log(`Beam input created: ${idType} ${id}`);
      break;

    default:
      // The documented list may not be exhaustive: acknowledge, don't fail.
      console.log(`Unhandled Cerebrum event: ${event}`);
  }
}

export async function POST(request: Request) {
  const secret = process.env.CEREBRUM_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('CEREBRUM_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = getSignatureHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let payload: CerebrumEvent;
  try {
    payload = verifyCerebrumWebhook(rawBody, headers, secret);
  } catch (err) {
    console.error('Cerebrum webhook verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same message ID; acknowledge duplicates with 200.
  const messageId = headers['svix-id'];
  if (processedMessageIds.has(messageId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Cerebrum needs a 2xx within 30 seconds. In production, enqueue the
    // payload here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Cerebrum event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
