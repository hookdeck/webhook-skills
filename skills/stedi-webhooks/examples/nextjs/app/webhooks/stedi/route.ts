// Generated with: stedi-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Stedi event destinations follow the Standard Webhooks specification:
//   webhook-id         unique message ID, "msg_{UUID}" (stable across retries)
//   webhook-timestamp  Unix seconds when Stedi CREATED the event (not delivered)
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list during rotation)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the destination's secret after its `whsec_` prefix.
// (Stedi's docs describe the signed payload as "timestamp.body"; the
// Standard Webhooks spec and the standardwebhooks library include the id.)
// ---------------------------------------------------------------------------

interface StediResource {
  id: string;
  type: string;
}

// Thin event: says what changed, not the new state. Fetch the resource via the Stedi API.
interface StediEvent {
  id: string; // evt_{UUID}
  object: string; // "v1.event"
  type: string; // e.g. "enrollment.activated"
  account: string;
  environment: string;
  created: string;
  resource: StediResource;
  relatedResources?: StediResource[];
}

/**
 * Verify a Stedi delivery manually. The standardwebhooks package would also
 * work, but it hard-codes a 5-minute timestamp window. Stedi retries for up to
 * 48 hours with the original creation timestamp, so every retry would be
 * rejected. Here the window is optional (0 disables it).
 */
function verifyStediWebhook(
  rawBody: string,
  id: string,
  timestamp: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 0
): boolean {
  if (toleranceSeconds > 0) {
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest();

  // Several "v1,<sig>" entries are present while a rotated secret is still valid.
  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    try {
      const received = Buffer.from(sig, 'base64');
      return received.length === expected.length && crypto.timingSafeEqual(received, expected);
    } catch {
      return false;
    }
  });
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Stedi recommends deduping on the webhook-id header.
const processedMessageIds = new Set<string>();

function handleEvent(event: StediEvent): void {
  const { type, resource, relatedResources = [] } = event;

  switch (type) {
    case 'event.ping':
      console.log(`Ping from destination ${resource?.id}`);
      break;

    // --- Transaction enrollment ---------------------------------------------
    case 'enrollment.activated':
      console.log(`Enrollment ${resource?.id} is LIVE`);
      break;
    case 'enrollment.rejected':
      console.log(`Enrollment ${resource?.id} was rejected by the payer`);
      break;
    case 'enrollment.updated':
      console.log(`Enrollment ${resource?.id} changed`);
      break;
    case 'enrollment.task.assigned':
    case 'enrollment.task.completed':
    case 'enrollment.task.deleted': {
      const enrollment = relatedResources.find((r) => r.type === 'enrollment');
      console.log(`${type}: task ${resource?.id} (enrollment ${enrollment?.id})`);
      break;
    }

    // --- File processing ------------------------------------------------------
    case 'file.processed':
      console.log(`File processed: execution ${resource?.id}`);
      break;
    case 'file.failed':
      console.log(`File failed: execution ${resource?.id}`);
      break;
    case 'transaction.processed': {
      // relatedResources holds transaction.x12.<set id> (e.g. 835, 277) and the execution
      const txn = relatedResources.find((r) => String(r.type).startsWith('transaction.x12.'));
      console.log(`Transaction processed: ${txn?.type} ${txn?.id ?? resource?.id}`);
      break;
    }

    // --- OAuth apps -------------------------------------------------------------
    case 'app.installed':
    case 'app.uninstalled': {
      const client = relatedResources.find((r) => r.type === 'app.client');
      console.log(`${type}: app ${resource?.id} (client ${client?.id})`);
      break;
    }

    default:
      console.log(`Unhandled Stedi event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.STEDI_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STEDI_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  const tolerance = Number(process.env.STEDI_TIMESTAMP_TOLERANCE_SECONDS || 0);
  if (!verifyStediWebhook(rawBody, id, timestamp, signature, secret, tolerance)) {
    console.error('Stedi webhook verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: StediEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Retries and manual recoveries reuse the same webhook-id; acknowledge duplicates with 200.
  if (processedMessageIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue here and process asynchronously.
    handleEvent(event);
    processedMessageIds.add(id);
  } catch (err) {
    console.error('Error handling Stedi event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
