// Generated with: airweave-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// Airweave delivers webhooks through Svix (Standard Webhooks):
//   svix-id         message ID, stable across retries to one subscription
//   svix-timestamp  Unix seconds when the delivery attempt was made
//   svix-signature  space-delimited "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

export interface AirweaveEvent {
  event_type: string; // e.g. "sync.completed"
  timestamp: string; // ISO 8601
  [key: string]: any; // per-domain fields: sync_job_id, collection_name, source_type, ...
}

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Verify an Airweave delivery with the official Svix library. Svix checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so the JSON is
 * parsed here after verification succeeds.
 */
function verifyAirweaveWebhook(rawBody: string, headers: SvixHeaders, secret: string): AirweaveEvent {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody) as AirweaveEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// svix-id is the same on every retry of a message to this subscription.
const processedMessageIds = new Set<string>();

function handleEvent(event: AirweaveEvent): void {
  const eventType = event.event_type;

  switch (eventType) {
    // --- Sync jobs ---------------------------------------------------------
    case 'sync.pending':
    case 'sync.running':
    case 'sync.cancelled':
      console.log(`${eventType}: job ${event.sync_job_id} for ${event.collection_name} (${event.source_type})`);
      break;
    case 'sync.completed':
      // Metrics are only present on sync.completed.
      console.log(
        `Sync completed: ${event.collection_name} (${event.entities_inserted ?? 0} inserted, ` +
          `${event.entities_updated ?? 0} updated, ${event.entities_deleted ?? 0} deleted, ` +
          `${event.chunks_written ?? 0} chunks)`
      );
      // Trigger your downstream workflow here.
      break;
    case 'sync.failed':
      console.log(`Sync failed: ${event.collection_name} (${event.source_type}) - ${event.error ?? 'Unknown error'}`);
      // Send an alert here.
      break;

    // --- Source connections --------------------------------------------------
    case 'source_connection.created':
      console.log(`Source connection created: ${event.source_type} (authenticated: ${event.is_authenticated})`);
      break;
    case 'source_connection.auth_completed':
      console.log(`Source connection authenticated: ${event.source_type} ${event.source_connection_id}`);
      break;
    case 'source_connection.deleted':
      console.log(`Source connection deleted: ${event.source_type} ${event.source_connection_id}`);
      break;

    // --- Collections -----------------------------------------------------------
    case 'collection.created':
    case 'collection.updated':
    case 'collection.deleted':
      console.log(`${eventType}: ${event.collection_name} (${event.collection_readable_id})`);
      break;

    default:
      // The docs say to ignore unknown types so new events don't break you.
      console.log(`Unhandled Airweave event type: ${eventType}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.AIRWEAVE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('AIRWEAVE_WEBHOOK_SECRET is not set, rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // Raw body: the signature covers the exact bytes, so never verify request.json().
  const rawBody = await request.text();

  let event: AirweaveEvent;
  try {
    event = verifyAirweaveWebhook(
      rawBody,
      { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature },
      secret
    );
  } catch (err) {
    console.error('Airweave webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (at-least-once delivery): acknowledge with 200.
  if (processedMessageIds.has(svixId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Airweave times out after 30 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(svixId);
  } catch (err) {
    console.error('Error handling Airweave event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
