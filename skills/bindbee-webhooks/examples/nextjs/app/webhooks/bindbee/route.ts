// Generated with: bindbee-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set BINDBEE_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.BINDBEE_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`BINDBEE_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Bindbee delivery (Standard Webhooks headers) and throw if it's invalid.
 *
 * Written out by hand, not with the `standardwebhooks` or `svix` libraries: they base64-decode
 * the secret, but Bindbee's secret is used as raw UTF-8 bytes. A secret that starts with
 * `whsec_` is base64-decoded after the prefix, as Hookdeck does; any other secret is the key as-is.
 */
function verifyBindbeeSignature(
  rawBody: string | Buffer,
  headers: Headers,
  secret: string,
  toleranceSeconds: number = timestampToleranceSeconds()
): void {
  // webhook-* headers; fall back to svix-* when webhook-id is absent
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signatureHeader = headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing signature headers');
  if (!/^[1-9][0-9]*$/.test(timestamp)) throw new Error('Invalid timestamp');
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    throw new Error('Timestamp outside tolerance');
  }

  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  if (key.length === 0) throw new Error('Empty signing key'); // fail closed

  // Signed content is `${id}.${timestamp}.${rawBody}`, HMAC-SHA256, base64
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  // The header is a space-separated list of "v1,<base64>" entries; any match is valid, other versions are ignored
  const match = signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!match) throw new Error('No matching signature');
}

// Data events are named <category>.<model>.<action>, e.g. hris.employee.created
const DATA_EVENT = /^(hris|ats|lms)\.([a-z_]+)\.(created|updated)$/;

// webhook-id is the event id and is identical on every retry: use it as the idempotency key.
// In-memory for the example; use a durable store (Redis, a database) in production.
const seenEventIds = new Set<string>();

// The dashboard's "Send test event" sends a HEAD request with no body; anything but a 5xx passes.
export async function HEAD() {
  return new Response(null, { status: 200 });
}

export async function POST(request: Request) {
  const secret = process.env.BINDBEE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BINDBEE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const hasHeaders = (p: string) =>
    request.headers.get(`${p}-id`) && request.headers.get(`${p}-timestamp`) && request.headers.get(`${p}-signature`);
  if (!hasHeaders('webhook') && !hasHeaders('svix')) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body. Do not JSON.parse before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());

  try {
    verifyBindbeeSignature(rawBody, request.headers, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    console.error('Webhook verification failed:', msg);
    const detail = /outside tolerance/i.test(msg) ? 'Timestamp too old' : 'Invalid signature';
    // 401 is final for Bindbee: it won't retry a request that can't verify
    return NextResponse.json({ error: detail }, { status: 401 });
  }

  // Verified: now parse
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType: string = payload.event; // top-level `event` (version 2)
  const eventId: string = payload.id;
  if (seenEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true, event: eventType }, { status: 200 });
  }
  seenEventIds.add(eventId);

  const connector = payload.connector?.id;
  switch (eventType) {
    case 'connector.linked':
      console.log('Connector linked:', connector, payload.connector?.origin_id);
      break;
    case 'connector.sync.started':
      console.log('Sync started:', connector, payload.sync?.sync_id);
      break;
    case 'connector.sync.completed':
      // Every data event of this sync arrived before this one
      console.log('Sync completed:', connector, payload.sync?.sync_id);
      break;
    case 'connector.sync.failed':
      console.error('Sync failed:', connector, payload.error?.message);
      break;
    case 'connector.relink_needed':
      // The one event that means your customer has to act: ask them to reconnect
      console.error('Relink needed:', connector, payload.error?.message);
      break;
    case 'connector.relinked':
      console.log('Connector relinked:', connector);
      break;
    default: {
      const data = DATA_EVENT.exec(String(eventType));
      if (data) {
        // `data` is an array of record IDs; read them with the `ids` filter on the model's endpoint
        console.log(`${data[1]} ${payload.model ?? data[2]} ${data[3]}:`, payload.data?.length ?? 0, 'record id(s), sequence', payload.sequence);
      } else {
        console.log('Unhandled Bindbee event:', eventType);
      }
    }
  }

  // Respond 200 as soon as the signature verifies; do real work after responding / on a queue
  return NextResponse.json({ received: true, event: eventType }, { status: 200 });
}
