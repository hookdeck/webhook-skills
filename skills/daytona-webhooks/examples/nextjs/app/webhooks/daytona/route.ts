// Generated with: daytona-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Daytona's webhook docs don't describe signing. Deliveries go through Svix:
//   svix-id         message ID (same on retries)
//   svix-timestamp  Unix seconds when the attempt was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

type DaytonaEvent = {
  event: string; // e.g. "sandbox.state.updated"
  timestamp: string; // ISO 8601
  [key: string]: any; // flat event fields: id, name, organizationId, state, oldState, newState, ...
};

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set DAYTONA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.DAYTONA_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`DAYTONA_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Svix-signed delivery (the Standard Webhooks scheme) and throw if it's invalid.
 *
 * Written out rather than calling the `svix` SDK, because the SDK always enforces a
 * 5-minute timestamp window. Hookdeck retries and replays carry the original
 * svix-timestamp, so that window would reject them. Here the window is opt-in via
 * DAYTONA_TIMESTAMP_TOLERANCE_SECONDS.
 */
function verifySvixSignature(
  rawBody: string | Buffer,
  headers: Record<string, string | null | undefined>,
  secret: string,
  toleranceSeconds: number = timestampToleranceSeconds()
): void {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing Svix signature headers');
  if (!/^\d+$/.test(timestamp)) throw new Error('Invalid svix-timestamp');
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    throw new Error('Timestamp outside tolerance');
  }

  // Key = base64-decoded secret after the whsec_ prefix
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  // svix-signature is a space-delimited list of "v1,<base64>" entries; any match is valid
  const match = signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!match) throw new Error('No matching signature');
}

/** Verify a Daytona delivery and return the parsed payload. Throws if it's invalid. */
function verifyDaytonaWebhook(rawBody: string, headers: SvixHeaders, secret: string): DaytonaEvent {
  verifySvixSignature(rawBody, headers, secret);
  return JSON.parse(rawBody) as DaytonaEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The payload has no event ID, so dedupe on svix-id (stable across retries).
const processedMessageIds = new Set<string>();

function handleEvent(payload: DaytonaEvent): void {
  switch (payload.event) {
    case 'sandbox.created':
      console.log(`Sandbox ${payload.id} created in org ${payload.organizationId} (${payload.sandboxClass}, ${payload.state})`);
      break;
    case 'sandbox.state.updated':
      console.log(`Sandbox ${payload.id}: ${payload.oldState} → ${payload.newState}`);
      break;
    case 'snapshot.created':
      console.log(`Snapshot ${payload.name} (${payload.id}) created, state ${payload.state}`);
      break;
    case 'snapshot.state.updated':
      console.log(`Snapshot ${payload.name} (${payload.id}): ${payload.oldState} → ${payload.newState}`);
      break;
    case 'snapshot.removed':
      console.log(`Snapshot ${payload.name} (${payload.id}) removed at ${payload.removedAt}`);
      break;
    case 'volume.created':
      console.log(`Volume ${payload.name} (${payload.id}) created, state ${payload.state}`);
      break;
    case 'volume.state.updated':
      console.log(`Volume ${payload.name} (${payload.id}): ${payload.oldState} → ${payload.newState}`);
      break;
    default:
      console.log(`Unhandled Daytona event: ${payload.event}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.DAYTONA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('DAYTONA_WEBHOOK_SECRET is not set — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // request.text() gives the exact bytes Daytona sent; request.json() would break the HMAC.
  const rawBody = await request.text();

  let payload: DaytonaEvent;
  try {
    payload = verifyDaytonaWebhook(
      rawBody,
      { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature },
      secret
    );
  } catch (err) {
    console.error('Daytona webhook verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  if (processedMessageIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(id);
  } catch (err) {
    console.error('Error handling Daytona event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
