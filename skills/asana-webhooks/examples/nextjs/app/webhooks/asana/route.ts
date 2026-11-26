// Generated with: asana-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Asana webhook signature.
 *
 * Asana signs each delivery with an HMAC-SHA256 (hex) of the RAW request body,
 * keyed with the secret captured during the handshake.
 */
function verifyAsanaSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

interface AsanaEvent {
  action: string;
  resource?: { gid: string; resource_type: string };
  parent?: { gid: string; resource_type: string } | null;
  user?: { gid: string; resource_type: string } | null;
  created_at?: string;
  change?: { field: string; action: string };
}

export async function POST(request: NextRequest) {
  // Read the raw body once; needed for signature verification.
  const rawBody = await request.text();
  const hookSecret = request.headers.get('x-hook-secret');
  const signature = request.headers.get('x-hook-signature');

  // --- Phase 1: Handshake ---
  // On creation Asana sends X-Hook-Secret and no signature. Echo it back with 200
  // and store it for verifying future deliveries.
  if (hookSecret) {
    // Your code: Persist `hookSecret` keyed by the webhook. This example verifies
    // against ASANA_WEBHOOK_SECRET from the environment instead.
    console.log('Handshake received; echoing X-Hook-Secret');
    return new NextResponse(null, {
      status: 200,
      headers: { 'X-Hook-Secret': hookSecret },
    });
  }

  // --- Phase 2: Event delivery ---
  if (!verifyAsanaSignature(rawBody, signature, process.env.ASANA_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const events: AsanaEvent[] = payload.events || [];

  // Heartbeats arrive as an empty events array.
  if (events.length === 0) {
    console.log('Heartbeat received');
    return NextResponse.json({ received: true });
  }

  for (const event of events) {
    handleAsanaEvent(event);
  }

  // Acknowledge quickly (Asana times out after 10s). Do heavy work async.
  return NextResponse.json({ received: true });
}

/**
 * Dispatch a single compact Asana event.
 * Events name what changed; fetch full details via the API using resource.gid.
 */
function handleAsanaEvent(event: AsanaEvent) {
  const resourceType = event.resource?.resource_type;
  const gid = event.resource?.gid;

  switch (event.action) {
    case 'added':
      console.log(`Added ${resourceType} ${gid}`);
      // Your code: Sync the new resource into your system.
      break;

    case 'changed':
      console.log(`Changed ${resourceType} ${gid} (field: ${event.change?.field})`);
      // Your code: Fetch the resource and update your mirror.
      break;

    case 'removed':
      console.log(`Removed ${resourceType} ${gid} from parent ${event.parent?.gid}`);
      // Your code: Update parent membership.
      break;

    case 'deleted':
      console.log(`Deleted ${resourceType} ${gid}`);
      // Your code: Soft-delete or archive in your system.
      break;

    case 'undeleted':
      console.log(`Undeleted ${resourceType} ${gid}`);
      // Your code: Restore in your system.
      break;

    default:
      console.log(`Unhandled action: ${event.action}`);
  }
}
